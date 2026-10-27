"use client";

import { useState } from "react";

export function SmartKeywords({ fileId }: { fileId: string }) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/files/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate keywords");
        return;
      }
      setKeywords(data.keywords || []);
    } catch {
      setError("Failed to generate keywords");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Smart Keywords</h2>
          <p className="mt-1 text-xs text-slate-500">Key terms extracted from the document</p>
        </div>
        {!keywords.length && !loading ? (
          <button
            className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
            onClick={generate}
            type="button"
          >
            Generate
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <span className="h-7 w-16 animate-pulse rounded-full bg-white/5" key={i} />
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-sm text-rose-200">{error}</p>
          <button className="text-sm text-blue-300 hover:text-blue-200" onClick={generate} type="button">
            Retry
          </button>
        </div>
      ) : null}
      {keywords.length && !loading ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <span
              className="cursor-pointer rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-200 transition hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-blue-200"
              key={keyword}
              title="Keyword"
            >
              {keyword}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
