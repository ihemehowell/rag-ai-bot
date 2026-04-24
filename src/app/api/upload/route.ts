import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { embedBatch } from "@/lib/embeddings";
import { pineconeIndex } from "@/lib/pinecone";
import { v4 as uuidv4 } from "uuid";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (data: Buffer) => Promise<{ text?: string }>;


export const runtime = "nodejs";
export const maxDuration = 60;

function parsePagesFromText(rawText: string): string[] {
  const pages = rawText
    .split("\f")
    .map((page) => page.trim())
    .filter(Boolean);

  if (pages.length > 0) {
    return pages;
  }

  return [rawText.trim()].filter(Boolean);
}

function buildSegmentsFromPages(pages: string[]): {
  segments: string[];
  metadatas: Array<{ page: number; segment: number }>;
} {
  const segments: string[] = [];
  const metadatas: Array<{ page: number; segment: number }> = [];

  pages.forEach((pageText, pageIdx) => {
    const paragraphs = pageText
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 40);

    const usable = paragraphs.length > 0 ? paragraphs : [pageText.replace(/\s+/g, " ").trim()];

    usable.forEach((segmentText, segmentIdx) => {
      if (!segmentText) return;
      segments.push(segmentText);
      metadatas.push({ page: pageIdx + 1, segment: segmentIdx + 1 });
    });
  });

  return { segments, metadatas };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "A valid PDF is required" }, { status: 400 });
    }

    // 1. Parse PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = await extractPdfText(buffer);

    if (!rawText.trim()) {
      return NextResponse.json({ error: "PDF appears to be empty or scanned" }, { status: 400 });
    }

    // 2. Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 700,
      chunkOverlap: 120,
    });
    const pages = parsePagesFromText(rawText);
    const { segments, metadatas } = buildSegmentsFromPages(pages);
    const docs = await splitter.createDocuments(
      segments,
      metadatas
    );
    const chunks = docs.map((doc) => doc.pageContent);

    // 3. Embed all chunks
    const embeddings = await embedBatch(chunks);

    // 4. Upsert into Pinecone
    const vectors = chunks.map((chunk, i) => ({
      id: uuidv4(),
      values: embeddings[i],
      metadata: {
        text: chunk,
        source: file.name,
        page: Number(docs[i]?.metadata?.page) || 1,
        segment: Number(docs[i]?.metadata?.segment) || 1,
        chunkIndex: i,
      },
    }));

    await pineconeIndex.upsert({ records: vectors });

    return NextResponse.json({
      success: true,
      chunks: chunks.length,
      source: file.name,
    });
  } catch (err) {
    console.error("[UPLOAD ERROR]", err);

    const message = err instanceof Error ? err.message : "";
    if (/Invalid\s*PDF|InvalidPDF/i.test(message)) {
      return NextResponse.json({ error: "Invalid or corrupted PDF file" }, { status: 400 });
    }

    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}