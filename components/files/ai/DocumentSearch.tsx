"use client";

import { useState } from "react";

type Match = { index: number; snippet: string };

export function DocumentSearch({ fileId }: { fileId: string }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/files/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to search");
        return;
      }
      setMatches(data.matches || []);
      setCount(data.count || 0);
    } catch {
      setError("Failed to search");
    } finally {
      setLoading(false);
    }
  }

  function highlight(snippet: string) {
    if (!query.trim()) return snippet;
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    const parts = snippet.split(regex);
    const matchesFound = snippet.match(regex) || [];
    return (
      <>
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {matchesFound[i] ? <mark className="rounded bg-blue-400/30 px-0.5 text-blue-100">{matchesFound[i]}</mark> : null}
          </span>
        ))}
      </>
    );
  }

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div>
        <h2 className="text-base font-semibold text-white">Search Inside Document</h2>
        <p className="mt-1 text-xs text-slate-500">Find and highlight matches within the document</p>
      </div>
      <div className="mt-4 flex gap-2">
        <input
          className="h-10 flex-1 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400/50"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="Search text..."
          value={query}
        />
        <button
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:opacity-50"
          disabled={loading || !query.trim()}
          onClick={search}
          type="button"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      {count > 0 ? (
        <p className="mt-3 text-xs text-slate-400">
          {count} {count === 1 ? "match" : "matches"} found
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
      {matches.length ? (
        <div className="mt-4 space-y-2">
          {matches.map((match, i) => (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-sm text-slate-300" key={i}>
              {highlight(match.snippet)}
            </div>
          ))}
        </div>
      ) : null}
      {!loading && query.trim() && count === 0 && !error ? (
        <p className="mt-4 text-sm text-slate-500">No matches found</p>
      ) : null}
    </section>
  );
}
