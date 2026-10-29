"use client";

import { useEffect, useState } from "react";
import type { ChatUsage, FileTagView } from "@/types/ai";

function errorMessage(payload: unknown, fallback: string): string {
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

export function SmartTags({ fileId }: { fileId: string }) {
  const [tags, setTags] = useState<FileTagView[]>([]);
  const [source, setSource] = useState("local");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/tags?fileId=${encodeURIComponent(fileId)}`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("load-failed");
        return response.json() as Promise<{ tags?: FileTagView[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setTags(data.tags ?? []);
        setSource(data.tags?.[0]?.source ?? "local");
      })
      .catch(() => {
        if (!cancelled) setError("Could not load tags.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/files/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, refresh: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const usage = data && typeof data === "object" && "usage" in data
          ? (data as { usage?: ChatUsage }).usage
          : undefined;
        const suffix = usage ? ` (${usage.used}/${usage.limit} used today)` : "";
        throw new Error(`${errorMessage(data, "Could not generate tags.")}${suffix}`);
      }
      const parsed = data as { tags?: FileTagView[]; source?: string };
      setTags(parsed.tags ?? []);
      setSource(parsed.source ?? "local");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate tags.");
    } finally {
      setRefreshing(false);
    }
  }

  const categories = [...new Set(tags.map((tag) => tag.category))];
  const category = categories[0] ?? "General";

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">AI tags &amp; category</h2>
            {tags.length ? (
              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-200">
                {category}
              </span>
            ) : null}
            {tags.length ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                {source === "local" ? "Local" : source === "openai" ? "OpenAI" : source === "gemini" ? "Gemini" : source}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Smart categorization and tags derived from the document content.
          </p>
        </div>
        <button
          className="min-h-9 rounded-lg border border-white/10 px-2.5 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
          disabled={loading || refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          {refreshing ? "Refreshing…" : tags.length ? "Refresh tags" : "Generate tags"}
        </button>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((index) => (
            <span className="h-6 w-20 animate-pulse rounded-full bg-white/5" key={index} />
          ))}
        </div>
      ) : tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200"
              key={tag.id}
              title={`${tag.category} · ${Math.round(tag.confidence * 100)}% confidence`}
            >
              {tag.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-slate-500">
          No tags yet. Generate tags to categorize this document automatically.
        </p>
      )}

      {error ? (
        <p aria-live="polite" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
