"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { indexWorkspaceFiles, semanticSearchWorkspace } from "@/app/actions/search";
import type { SemanticMatchView, SemanticSearchResult } from "@/types/search";

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function SemanticSearchClient() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SemanticSearchResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Enter at least two characters.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const next = await semanticSearchWorkspace({ query: trimmed });
        setResult(next);
        setSearched(true);
      } catch {
        setError("Search failed. Please try again.");
      }
    });
  }

  function index() {
    startTransition(async () => {
      const outcome = await indexWorkspaceFiles();
      setToast(outcome.message);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
          <label className="sr-only" htmlFor="semantic-query">Search your files by meaning</label>
          <div className="relative flex-1">
            <svg aria-hidden="true" className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24">
              <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7" />
              <path d="m16 16 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            </svg>
            <input
              className="h-11 w-full rounded-xl border border-white/10 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400/50"
              id="semantic-query"
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Describe what you are looking for, e.g. “quarterly revenue report”"
              value={query}
            />
          </div>
          <button className="min-h-11 rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50" disabled={busy || query.trim().length < 2} type="submit">
            {busy ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Semantic search uses local embeddings of your document text and metadata.</span>
          <button className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-50" disabled={busy} onClick={index} type="button">
            Index more files
          </button>
        </div>
        {error ? (
          <p aria-live="polite" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2.5 text-sm text-rose-200" role="alert">{error}</p>
        ) : null}
      </section>

      {result ? (
        <p className="text-xs text-slate-500">
          Found {result.matches.length} {result.matches.length === 1 ? "match" : "matches"} across {result.scanned} scanned files · {result.indexed} indexed
        </p>
      ) : null}

      {searched && result && result.matches.length === 0 ? (
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-300">No matches found</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Try different wording, or index more files so their contents can be compared.
          </p>
        </section>
      ) : null}

      {result && result.matches.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {result.matches.map((match) => (
            <ResultCard key={match.id} match={match} />
          ))}
        </ul>
      ) : null}

      {!searched ? (
        <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-300">Find files by meaning, not just names</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Describe a topic, phrase, or document purpose. Matching uses AI embeddings generated from your files.
          </p>
        </section>
      ) : null}

      {toast ? (
        <div aria-live="polite" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-2xl" role="status">{toast}</div>
      ) : null}
    </div>
  );
}

function ResultCard({ match }: { match: SemanticMatchView }) {
  const score = Math.round(match.score * 100);
  return (
    <li className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 transition hover:border-white/15 hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <Link className="min-w-0 truncate text-sm font-medium text-slate-100 transition hover:text-blue-200" href={`/files/${match.id}/preview`} title={match.originalName}>
          {match.originalName}
        </Link>
        {match.isFavorite ? <span aria-label="Favorite" className="shrink-0 text-amber-300">★</span> : null}
      </div>
      <p className="mt-1 truncate text-xs text-slate-500">{match.folderName} · {match.extension.toUpperCase()} · {formatBytes(match.size)}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-600">Updated {formatDate(match.updatedAt)}</span>
        <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-200">{score}% match</span>
      </div>
    </li>
  );
}
