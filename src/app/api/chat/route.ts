import { NextRequest, NextResponse } from "next/server";
import { embedBatch } from "@/lib/embeddings";
import { pineconeIndex } from "@/lib/pinecone";
import { groqLLM } from "@/lib/groq";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

export const runtime = "nodejs";
export const maxDuration = 60;

type MatchMetadata = {
  text?: string;
  source?: string;
  page?: number | string;
  segment?: number | string;
  chunkIndex?: number | string;
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "by", "as", "is", "are", "was", "were", "be", "this", "that", "it", "at", "from", "your", "you", "about", "what", "which", "when", "where", "why", "how"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function lexicalOverlapScore(query: string, doc: string): number {
  const qTokens = tokenize(query);
  const dTokens = tokenize(doc);

  if (qTokens.length === 0 || dTokens.length === 0) {
    return 0;
  }

  const qSet = new Set(qTokens);
  const dSet = new Set(dTokens);
  let overlap = 0;

  qSet.forEach((token) => {
    if (dSet.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.sqrt(qSet.size * dSet.size);
}

function buildQueryVariants(question: string): string[] {
  const normalized = question.replace(/\s+/g, " ").trim();
  const tokens = tokenize(normalized);
  const keywordQuery = Array.from(new Set(tokens)).slice(0, 10).join(" ");

  const variants = [normalized];

  if (keywordQuery && keywordQuery !== normalized.toLowerCase()) {
    variants.push(keywordQuery);
  }

  if (tokens.length >= 6) {
    const compressed = [...tokens.slice(0, 4), ...tokens.slice(-3)].join(" ");
    variants.push(compressed);
  }

  return Array.from(new Set(variants.map((v) => v.trim()).filter(Boolean))).slice(0, 3);
}

function extractChunkText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part) {
          const value = (part as { text?: unknown }).text;
          return typeof value === "string" ? value : "";
        }

        return "";
      })
      .join("");
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const { question, history = [], activeSource } = await req.json();
    const normalizedActiveSource =
      typeof activeSource === "string" && activeSource.trim().length > 0
        ? activeSource.trim()
        : null;

    if (!question?.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // 1. Build query variants and fetch candidates
    const queryVariants = buildQueryVariants(question);
    const queryEmbeddings = await embedBatch(queryVariants);

    const queryResults = await Promise.all(
      queryEmbeddings.map((vector) =>
        pineconeIndex.query({
          vector,
          topK: 10,
          includeMetadata: true,
          ...(normalizedActiveSource
            ? {
                filter: {
                  source: { $eq: normalizedActiveSource },
                },
              }
            : {}),
        })
      )
    );

    // 2. Merge candidates from all query variants
    const mergedMatches = new Map<
      string,
      { match: (typeof queryResults)[number]["matches"][number]; variantHits: Set<number>; bestScore: number }
    >();

    queryResults.forEach((result, variantIdx) => {
      result.matches.forEach((match, localIdx) => {
        const metadata = (match.metadata ?? {}) as MatchMetadata;
        const fallbackId = `${metadata.source ?? "doc"}|${metadata.page ?? "na"}|${metadata.chunkIndex ?? localIdx}`;
        const id = match.id || fallbackId;

        const existing = mergedMatches.get(id);
        if (!existing) {
          mergedMatches.set(id, {
            match,
            variantHits: new Set([variantIdx]),
            bestScore: match.score ?? 0,
          });
          return;
        }

        existing.variantHits.add(variantIdx);
        if ((match.score ?? 0) > existing.bestScore) {
          existing.match = match;
          existing.bestScore = match.score ?? 0;
        }
      });
    });

    // 3. Hybrid-rerank for relevance
    const scoredMatches = Array.from(mergedMatches.values())
      .map(({ match, variantHits }) => {
        const metadata = (match.metadata ?? {}) as MatchMetadata;
        const text = (metadata.text || "").trim();

        if (!text) {
          return null;
        }

        const page = metadata.page ? Number(metadata.page) : undefined;
        const segment = metadata.segment ? Number(metadata.segment) : undefined;
        const vectorScore = match.score ?? 0;
        const lexicalScore = lexicalOverlapScore(question, text);
        const hitBoost = variantHits.size / queryVariants.length;
        const finalScore = vectorScore * 0.72 + lexicalScore * 0.22 + hitBoost * 0.06;

        return {
          text,
          source: metadata.source || "Uploaded PDF",
          page,
          segment,
          vectorScore,
          lexicalScore,
          finalScore,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.finalScore - a.finalScore);

    const selected: typeof scoredMatches = [];
    const seenKeys = new Set<string>();

    for (const match of scoredMatches) {
      const dedupeKey = `${match.source}|${match.page ?? "na"}|${match.segment ?? "na"}`;
      if (seenKeys.has(dedupeKey)) {
        continue;
      }

      selected.push(match);
      seenKeys.add(dedupeKey);

      if (selected.length >= 6) {
        break;
      }
    }

    const rankedMatches = selected.map((match, index) => ({ ...match, ref: index + 1 }));

    const context = rankedMatches
      .map(
        (item) =>
          `[${item.ref}] Source: ${item.source}${item.page ? ` (page ${item.page})` : ""}\n${item.text}`
      )
      .join("\n\n");

    if (!context) {
      return new Response("I couldn't find relevant information in the uploaded documents.", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if ((rankedMatches[0]?.finalScore ?? 0) < 0.12) {
      return new Response("I don't have enough relevant context in the uploaded documents to answer that confidently.", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // 3. Build prompt
    const systemPrompt = `You are a helpful assistant that answers questions strictly based on the provided document context.
If the answer is not in the context, say "I don't have enough information in the provided documents to answer that."
Do not make up information.
Use prior chat turns only for clarification when relevant, but prioritize the current user question and current context first.
  When you provide an answer, cite supporting references using [n] notation where n maps to the provided context blocks.

Context from documents:
${context}`;

    // 4. Build message history
    const trimmedHistory = Array.isArray(history) ? history.slice(-4) : [];
    const messages = [
      new SystemMessage(systemPrompt),
      ...trimmedHistory.map((msg: { role: string; content: string }) =>
        msg.role === "user"
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      ),
      new HumanMessage(question),
    ];

    // 5. Stream response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const streamResponse = await groqLLM.stream(messages);
          for await (const chunk of streamResponse) {
            const text = extractChunkText(chunk.content);
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }

          if (rankedMatches.length > 0) {
            const sourceList = rankedMatches
              .map(
                (item) =>
                  `[${item.ref}] ${item.source}${item.page ? `, page ${item.page}` : ""} (hybrid ${item.finalScore.toFixed(3)})`
              )
              .join("\n");

            controller.enqueue(encoder.encode(`\n\nSources:\n${sourceList}`));
          }
        } catch (streamErr) {
          console.error("[CHAT STREAM ERROR]", streamErr);
          controller.enqueue(encoder.encode("I ran into an issue generating a response. Please try again."));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[CHAT ERROR]", err);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}