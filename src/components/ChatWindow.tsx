"use client";
import { useState, useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  disabled: boolean;
  messages: ChatMessage[];
  activeSource?: string | null;
  onMessagesChange: (messages: ChatMessage[]) => void;
};

function sanitizeHistoryMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant") {
    return message;
  }

  const withoutSources = message.content.split("\n\nSources:\n")[0]?.trim() || "";
  return {
    role: "assistant",
    content: withoutSources,
  };
}

export default function ChatWindow({ disabled, messages, activeSource, onMessagesChange }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const starterPrompts = [
    "Summarize the document in 5 bullets",
    "List key obligations and risks",
    "What are the most important definitions?",
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading || disabled) return;

    const history = messages.slice(-4).map(sanitizeHistoryMessage).filter((msg) => msg.content.trim().length > 0);
    const userMessage: ChatMessage = { role: "user", content: question };
    const baseConversation: ChatMessage[] = [...messages, userMessage];
    onMessagesChange([...baseConversation, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history,
          activeSource,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        assistantText += chunk;
        onMessagesChange([...baseConversation, { role: "assistant", content: assistantText }]);
      }

      if (!assistantText.trim()) {
        onMessagesChange([
          ...baseConversation,
          { role: "assistant", content: "I couldn't generate a response. Please try again." },
        ]);
      }
    } catch {
      onMessagesChange([
        ...baseConversation,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div className="fancy-scroll flex-1 overflow-y-auto rounded-xl border border-slate-300/15 bg-slate-950/25 px-3 py-4 sm:px-4">
        {messages.length === 0 && (
          <div className="mt-14 space-y-4">
            <p className="text-center text-sm text-slate-300/70">
              Upload a PDF and start asking questions
            </p>

            {!disabled && (
              <div className="flex flex-wrap justify-center gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-full border border-slate-200/20 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 transition hover:border-teal-300/60 hover:text-teal-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}
        {loading && messages[messages.length - 1]?.content === "" && (
          <div className="mb-4 flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-slate-300/20 bg-slate-800/65 px-4 py-3">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-300 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-amber-300 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-orange-300 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 sm:gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder={disabled ? "Upload a PDF first to unlock chat" : "Ask a grounded question about your file"}
          disabled={disabled || loading}
          className="flex-1 rounded-xl border border-slate-200/20 bg-slate-900/65 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-teal-300/60 focus:ring-2 focus:ring-teal-400/30 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={disabled || loading || !input.trim()}
          className="rounded-xl border border-orange-300/25 bg-linear-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask
        </button>
      </div>
    </div>
  );
}