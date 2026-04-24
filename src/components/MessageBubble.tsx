type Props = {
  role: "user" | "assistant";
  content: string;
};

function splitSources(content: string): { body: string; sources: string[] } {
  const marker = "\n\nSources:\n";
  const idx = content.lastIndexOf(marker);

  if (idx === -1) {
    return { body: content, sources: [] };
  }

  const body = content.slice(0, idx).trim();
  const sourceLines = content
    .slice(idx + marker.length)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return { body, sources: sourceLines };
}

export default function MessageBubble({ role, content }: Props) {
  const isUser = role === "user";
  const { body, sources } = splitSources(content);

  return (
    <div className={`fade-rise mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[78%] ${
          isUser
            ? "rounded-br-sm border border-orange-300/40 bg-linear-to-br from-orange-500 to-amber-500 text-slate-950"
            : "rounded-bl-sm border border-slate-200/20 bg-slate-800/80 text-slate-100"
        }`}
      >
        {body}

        {!isUser && sources.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200/15 bg-slate-900/55 p-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300/80">
              Sources
            </p>
            <div className="space-y-1.5">
              {sources.map((source, idx) => (
                <p
                  key={`${source}-${idx}`}
                  className="rounded-md border border-slate-300/15 bg-slate-800/55 px-2 py-1 text-xs text-slate-200/90"
                >
                  {source}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}