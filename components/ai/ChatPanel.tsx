"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AiCitation,
  AiUsageSummary,
  ChatFileOption,
  ChatMessageView,
  ChatStreamEvent,
  ChatThreadView,
  ChatUsage,
} from "@/types/ai";

type ChatPanelProps = {
  mode: "file" | "workspace";
  fileId?: string;
  fileName?: string;
  files?: ChatFileOption[];
};

type ProviderState = {
  provider: string;
  model: string;
  local: boolean;
};

function providerName(provider: string): string {
  if (provider === "openai" || provider === "OpenAI") return "OpenAI";
  if (provider === "gemini" || provider === "Google Gemini") return "Google Gemini";
  if (provider === "local" || provider === "Local fallback") return "Local fallback";
  return provider;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function extractError(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
}

async function fetchThreads(scopeFileId: string): Promise<ChatThreadView[]> {
  const query = scopeFileId ? `?fileId=${encodeURIComponent(scopeFileId)}` : "";
  const response = await fetch(`/api/ai/chat${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load chats.");
  const data = (await response.json()) as { threads?: ChatThreadView[] };
  return data.threads ?? [];
}

function MarkdownAnswer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 text-sm leading-6 text-slate-200 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-200">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-200">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="text-slate-400">{children}</em>,
        a: ({ children, href }) => (
          <a className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200" href={href} rel="noreferrer" target="_blank">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-blue-400/40 pl-3 text-sm italic text-slate-400">{children}</blockquote>
        ),
        code: ({ children, className }) => (
          <code className={`rounded bg-white/8 px-1.5 py-0.5 text-[0.85em] text-blue-200 ${className ?? ""}`}>{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-auto rounded-xl border border-white/8 bg-[#0a0f1a] p-3 text-xs leading-6">{children}</pre>
        ),
        h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold text-white">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold text-white">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1.5 mt-2 text-sm font-semibold text-white">{children}</h3>,
        hr: () => <hr className="my-3 border-white/10" />,
      }}
      remarkPlugins={[remarkGfm]}
    >
      {content}
    </ReactMarkdown>
  );
}

function CitationList({ citations }: { citations: AiCitation[] }) {
  if (!citations.length) return null;
  return (
    <details className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-slate-200">
        {citations.length} {citations.length === 1 ? "source" : "sources"} used
      </summary>
      <ul className="mt-2 space-y-2">
        {citations.map((citation) => (
          <li className="text-xs leading-5 text-slate-400" key={`${citation.fileId}-${citation.chunkIndex}-${citation.index}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-blue-400/10 px-1.5 py-0.5 font-semibold text-blue-200">[{citation.index}]</span>
              <Link
                className="font-medium text-slate-200 underline decoration-white/20 underline-offset-2 hover:text-blue-200"
                href={`/files/${citation.fileId}/preview?section=${citation.chunkIndex}`}
              >
                {citation.fileName}
              </Link>
              <span className="text-slate-500">· {citation.section}</span>
            </div>
            <p className="mt-1 text-slate-500">{citation.excerpt}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function MessageBubble({ message }: { message: ChatMessageView }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-500/15 text-sm leading-6 text-blue-50"
            : "border border-white/8 bg-white/[0.03]"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
        ) : message.content ? (
          <MarkdownAnswer content={message.content} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <span className="size-1.5 animate-pulse rounded-full bg-blue-300" />
            Searching your documents…
          </p>
        )}
        {!isUser && message.content ? <CitationList citations={message.citations} /> : null}
      </div>
      <span className="mt-1 px-1 text-[10px] text-slate-600">
        {isUser ? "You" : message.model === "local-extractive-v1" ? "Local fallback" : "CloudVault AI"} · {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

export function ChatPanel({ mode, fileId, fileName, files = [] }: ChatPanelProps) {
  const scopeFileId = fileId ?? "";
  const [threads, setThreads] = useState<ChatThreadView[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingThread, setLoadingThread] = useState(true);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [provider, setProvider] = useState<ProviderState | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const openThread = useCallback(async (id: string) => {
    setLoadingThread(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ai/chat?threadId=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("load-failed");
      const data = (await response.json()) as {
        thread?: { id: string };
        messages?: ChatMessageView[];
      };
      if (!data.thread) throw new Error("load-failed");
      setThreadId(data.thread.id);
      setMessages(data.messages ?? []);
    } catch {
      setError("Could not load that chat. Please try again.");
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // Usage and provider badge.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/usage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AiUsageSummary | null) => {
        if (cancelled || !data) return;
        setUsage({
          used: data.used,
          limit: data.limit,
          remaining: data.remaining,
          resetAt: data.resetAt,
        });
        setProvider({ provider: data.providerLabel, model: data.model, local: data.local });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the most recent conversation for this scope. The component is
  // intentionally remounted by its wrappers when the document scope changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await fetchThreads(scopeFileId);
        if (cancelled) return;
        setThreads(list);
        if (list[0]) {
          await openThread(list[0].id);
        } else {
          setLoadingThread(false);
        }
      } catch {
        if (!cancelled) {
          setLoadingThread(false);
          setError("Could not load your chat history.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [scopeFileId, openThread]);

  // Keep the transcript scrolled to the newest message.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function startNewChat() {
    abortRef.current?.abort();
    setBusy(false);
    setThreadId(null);
    setMessages([]);
    setInput("");
    setError("");
  }

  async function removeThread(id: string) {
    try {
      const response = await fetch(
        `/api/ai/chat?threadId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("delete-failed");
      setThreads((current) => current.filter((thread) => thread.id !== id));
      if (threadId === id) startNewChat();
    } catch {
      setError("Could not delete that chat.");
    }
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    setError("");
    setBusy(true);

    const now = new Date().toISOString();
    const assistantId = `stream-${Date.now()}`;
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: question,
        citations: [],
        model: null,
        createdAt: now,
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        citations: [],
        model: null,
        createdAt: now,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          threadId: threadId ?? undefined,
          fileId: threadId ? undefined : scopeFileId || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const usagePayload =
          payload && typeof payload === "object" && "usage" in payload
            ? (payload as { usage?: ChatUsage }).usage
            : undefined;
        if (usagePayload) setUsage(usagePayload);
        throw new Error(extractError(payload, "The AI could not answer that question."));
      }

      if (!response.body) throw new Error("The AI returned an empty response.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";

      function handle(event: ChatStreamEvent) {
        if (event.type === "meta") {
          setThreadId(event.threadId);
          setUsage(event.usage);
          setProvider({ provider: event.provider, model: event.model, local: event.local });
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, citations: event.citations, model: event.model }
                : message,
            ),
          );
        } else if (event.type === "delta") {
          streamed += event.text;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: streamed } : message,
            ),
          );
        } else if (event.type === "done") {
          setUsage(event.usage);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, id: event.messageId } : message,
            ),
          );
        } else if (event.type === "error") {
          setError(event.error);
        }
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
        let separator = buffer.indexOf("\n\n");
        while (separator !== -1) {
          const rawEvent = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          for (const line of rawEvent.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;
            try {
              handle(JSON.parse(payload) as ChatStreamEvent);
            } catch {
              // Ignore keep-alive or malformed frames.
            }
          }
          separator = buffer.indexOf("\n\n");
        }
      }

      setThreads(await fetchThreads(scopeFileId).catch(() => threads));
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "The AI could not answer that question.",
      );
      setMessages((current) => current.filter((message) => message.id !== assistantId));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const providerReady = provider && !provider.local;
  const remaining = usage?.remaining;
  const scopeLabel =
    mode === "file"
      ? fileName ?? "this document"
      : scopeFileId
        ? files.find((file) => file.id === scopeFileId)?.originalName ?? "selected document"
        : "your whole workspace";

  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/7 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">
              {mode === "file" ? "Chat with this document" : "Ask your documents"}
            </h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                providerReady
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
              title={
                provider
                  ? `${providerName(provider.provider)} · ${provider.model}`
                  : "Detecting AI provider"
              }
            >
              {provider ? providerName(provider.provider) : "Checking provider…"}
            </span>
            {usage ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  remaining === 0
                    ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                    : "border-white/10 bg-white/5 text-slate-400"
                }`}
              >
                {remaining === 0 ? "Daily limit reached" : `${usage.used}/${usage.limit} requests today`}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">
            {mode === "file" ? "Answers cite the sections used from this document." : `Context: ${scopeLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Chat history"
            className="h-9 max-w-[200px] rounded-lg border border-white/10 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-blue-400/50"
            disabled={loadingThread || busy}
            onChange={(event) => {
              if (!event.target.value) {
                startNewChat();
                return;
              }
              void openThread(event.target.value);
            }}
            value={threadId ?? ""}
          >
            <option value="">New chat</option>
            {threads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
          <button
            className="min-h-9 rounded-lg border border-white/10 px-2.5 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
            disabled={busy}
            onClick={startNewChat}
            type="button"
          >
            New
          </button>
          {threadId ? (
            <button
              aria-label="Delete this chat"
              className="min-h-9 rounded-lg border border-white/10 px-2.5 text-xs text-slate-400 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-40"
              disabled={busy}
              onClick={() => void removeThread(threadId)}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5" ref={scrollRef}>
        {loadingThread ? (
          <div className="space-y-3">
            <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-white/5" />
            <div className="ml-auto h-16 w-3/4 animate-pulse rounded-2xl bg-white/5" />
          </div>
        ) : messages.length ? (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300" aria-hidden="true">✦</span>
            <p className="mt-3 text-sm font-medium text-slate-200">
              {mode === "file" ? "Ask anything about this document" : "Ask across your whole workspace"}
            </p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
              Answers are grounded in your files and include citations to the exact sections used.
              {provider?.local
                ? " No provider key is configured, so answers use the local extractive fallback."
                : ""}
            </p>
          </div>
        )}
      </div>

      {error ? (
        <p aria-live="polite" className="mx-4 mb-2 rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-xs text-rose-200 sm:mx-5" role="alert">
          {error}
        </p>
      ) : null}

      <div className="border-t border-white/7 p-3 sm:p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor={`chat-question-${mode}`}>Ask a question</label>
          <textarea
            className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400/50"
            disabled={busy}
            id={`chat-question-${mode}`}
            maxLength={2_000}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={
              mode === "file"
                ? "What are the key points in this document?"
                : "What did we decide about the Q3 roadmap?"
            }
            rows={2}
            value={input}
          />
          <button
            className="min-h-11 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:pointer-events-none disabled:opacity-50"
            disabled={busy || input.trim().length < 2}
            type="submit"
          >
            {busy ? "Answering…" : "Send"}
          </button>
        </form>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span>
            {provider?.local
              ? "Local extractive mode — answers quote retrieved passages."
              : "Answers can be wrong. Verify citations before acting."}
          </span>
        </div>
      </div>
    </section>
  );
}
