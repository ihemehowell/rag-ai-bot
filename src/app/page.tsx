"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import UploadPanel from "@/components/UploadPanel";
import ChatWindow, { type ChatMessage } from "@/components/ChatWindow";

type ChatSession = {
  id: string;
  title: string;
  uploadedFile: string | null;
  messages: ChatMessage[];
  pinned: boolean;
  updatedAt: number;
};

const STORAGE_KEY = "rag-bot-chat-sessions-v1";

function createChatSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "New Chat",
    uploadedFile: null,
    messages: [],
    pinned: false,
    updatedAt: Date.now(),
  };
}

function deriveChatTitle(messages: ChatMessage[]): string {
  const firstQuestion = messages.find((msg) => msg.role === "user")?.content.trim();
  if (!firstQuestion) return "New Chat";
  return firstQuestion.length > 42 ? `${firstQuestion.slice(0, 42)}...` : firstQuestion;
}

function loadStoredSessions(): ChatSession[] {
  if (typeof window === "undefined") {
    return [createChatSession()];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createChatSession()];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createChatSession()];
    }

    const valid = parsed
      .filter((session): session is Partial<ChatSession> => Boolean(session) && typeof session === "object")
      .map((session) => ({
        id: typeof session.id === "string" ? session.id : crypto.randomUUID(),
        title: typeof session.title === "string" ? session.title : "New Chat",
        uploadedFile: typeof session.uploadedFile === "string" ? session.uploadedFile : null,
        messages: Array.isArray(session.messages) ? session.messages : [],
        pinned: Boolean(session.pinned),
        updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
      }));

    return valid.length > 0 ? valid : [createChatSession()];
  } catch {
    return [createChatSession()];
  }
}

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>(loadStoredSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  // Keep a valid active id on first render with seeded chat
  const activeId = sessions.some((s) => s.id === activeSessionId) ? activeSessionId : sessions[0].id;
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0];

  function updateActiveSession(updater: (session: ChatSession) => ChatSession) {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeId) return session;
        return updater(session);
      })
    );
  }

  function handleMessagesChange(messages: ChatMessage[]) {
    updateActiveSession((session) => ({
      ...session,
      messages,
      title: deriveChatTitle(messages),
      updatedAt: Date.now(),
    }));
  }

  function handleUploadSuccess(filename: string) {
    updateActiveSession((session) => ({
      ...session,
      uploadedFile: filename,
      updatedAt: Date.now(),
    }));
  }

  function handleNewChat() {
    const next = createChatSession();
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
  }

  function openSession(sessionId: string) {
    setActiveSessionId(sessionId);
  }

  function beginRename(session: ChatSession) {
    setRenamingSessionId(session.id);
    setRenameValue(session.title);
  }

  function cancelRename() {
    setRenamingSessionId(null);
    setRenameValue("");
  }

  function commitRename(sessionId: string) {
    const nextTitle = renameValue.trim() || "Untitled Chat";
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: nextTitle,
              updatedAt: Date.now(),
            }
          : session
      )
    );
    cancelRename();
  }

  function deleteSession(sessionId: string) {
    setSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== sessionId);
      if (remaining.length > 0) return remaining;
      return [createChatSession()];
    });

    if (sessionId === activeId) {
      const fallback = sessions.find((session) => session.id !== sessionId)?.id || "";
      setActiveSessionId(fallback);
    }

    if (renamingSessionId === sessionId) {
      cancelRename();
    }
  }

  function requestDeleteSession(session: ChatSession) {
    toast("Delete this chat?", {
      description: `\"${session.title}\" will be permanently removed.`,
      action: {
        label: "Delete",
        onClick: () => {
          deleteSession(session.id);
          toast.success("Chat deleted");
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
      duration: 10000,
    });
  }

  function togglePin(sessionId: string) {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              pinned: !session.pinned,
              updatedAt: Date.now(),
            }
          : session
      )
    );
  }

  const orderedSessions = [...sessions].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  const filteredSessions = orderedSessions.filter((session) => {
    const haystack = `${session.title} ${session.uploadedFile || ""}`.toLowerCase();
    return haystack.includes(searchQuery.toLowerCase().trim());
  });

  return (
    <main className="app-shell relative min-h-screen overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
      <div className="noise-overlay absolute inset-0" />

      <div className="relative mx-auto grid h-[94vh] w-full max-w-6xl gap-4 md:grid-cols-[280px_1fr]">
        <aside className="glass-panel shine-border fade-rise flex min-h-0 flex-col rounded-2xl p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">
                Workspace
              </p>
              <h1 className="text-lg font-semibold text-slate-50">RAG Bot</h1>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              className="rounded-lg border border-teal-300/30 bg-teal-300/10 px-2.5 py-1.5 text-xs font-semibold text-teal-100 transition hover:border-teal-200/60 hover:bg-teal-300/20"
            >
              + New Chat
            </button>
          </div>

          <UploadPanel
            key={activeSession.id}
            onUploadSuccess={handleUploadSuccess}
            activeFile={activeSession.uploadedFile}
          />

          <div className="mb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-lg border border-slate-300/20 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-teal-300/60 focus:ring-2 focus:ring-teal-400/20"
            />
          </div>

          <div className="mt-2 min-h-0 flex-1">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Chat History
            </p>
            <div className="fancy-scroll h-full overflow-y-auto pr-1">
              <div className="space-y-2">
                {filteredSessions.length === 0 && (
                  <p className="rounded-md border border-slate-300/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-300/75">
                    No chats match your search.
                  </p>
                )}

                {filteredSessions.map((session) => {
                  const active = session.id === activeId;
                  const isRenaming = renamingSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? "border-orange-300/55 bg-orange-300/15"
                          : "border-slate-300/20 bg-slate-900/40 hover:border-teal-300/45"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => commitRename(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(session.id);
                              if (e.key === "Escape") cancelRename();
                            }}
                            className="w-full rounded-md border border-teal-300/40 bg-slate-900/80 px-2 py-1 text-xs text-slate-100 outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSession(session.id)}
                            className="truncate text-left text-xs font-semibold text-slate-100"
                          >
                            {session.title}
                          </button>
                        )}

                        {!isRenaming && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => togglePin(session.id)}
                              className="rounded px-1.5 py-0.5 text-[10px] text-slate-300/80 hover:bg-slate-700/60 hover:text-amber-200"
                            >
                              {session.pinned ? "Unpin" : "Pin"}
                            </button>
                            <button
                              type="button"
                              onClick={() => beginRename(session)}
                              className="rounded px-1.5 py-0.5 text-[10px] text-slate-300/80 hover:bg-slate-700/60 hover:text-teal-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteSession(session)}
                              className="rounded px-1.5 py-0.5 text-[10px] text-slate-300/80 hover:bg-slate-700/60 hover:text-red-200"
                            >
                              Del
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="mt-1 truncate text-[11px] text-slate-300/70">
                        {session.uploadedFile || "No document"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <section className="glass-panel shine-border fade-rise flex min-h-0 flex-col rounded-2xl p-4 sm:p-5">
          <header className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-300/15 bg-slate-900/30 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-slate-100">{activeSession.title}</p>
              <p className="text-[11px] text-slate-300/70">
                {activeSession.uploadedFile ? `Using ${activeSession.uploadedFile}` : "Attach a PDF to start retrieval"}
              </p>
            </div>
            <div className="hidden items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-300/75 sm:flex">
              <span className="rounded-full border border-teal-300/40 bg-teal-300/10 px-2 py-1">Groq</span>
              <span className="rounded-full border border-orange-300/40 bg-orange-300/10 px-2 py-1">Pinecone</span>
            </div>
          </header>

          <ChatWindow
            key={activeSession.id}
            disabled={!activeSession.uploadedFile}
            messages={activeSession.messages}
            activeSource={activeSession.uploadedFile}
            onMessagesChange={handleMessagesChange}
          />
        </section>
      </div>
    </main>
  );
}