"use client";

import { useState } from "react";

type Summary = {
  executiveSummary: string;
  keyPoints: string[];
  importantTechnologies: string[];
  importantDates: string[];
  actionItems: string[];
};

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-full animate-pulse rounded bg-white/5" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-white/5" />
      <div className="h-3 w-3/5 animate-pulse rounded bg-white/5" />
    </div>
  );
}

export function AISummary({ fileId }: { fileId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/files/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate summary");
        return;
      }
      setSummary(data);
      setOpen(true);
    } catch {
      setError("Failed to generate summary");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02]">
      <button
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <div>
          <h2 className="text-base font-semibold text-white">AI Summary</h2>
          <p className="mt-1 text-xs text-slate-500">Executive summary, key points, technologies, dates & actions</p>
        </div>
        <span className="text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="border-t border-white/7 px-5 py-4">
          {!summary && !loading && !error ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-slate-400">Generate an AI-powered summary of this document</p>
              <button
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
                onClick={generate}
                type="button"
              >
                Generate Summary
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="space-y-4">
              <div className="h-2 w-24 animate-pulse rounded bg-white/5" />
              <Skeleton />
              <div className="h-2 w-24 animate-pulse rounded bg-white/5" />
              <Skeleton />
            </div>
          ) : null}
          {error ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-rose-200">{error}</p>
              <button
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5"
                onClick={generate}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          {summary && !loading ? (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Executive Summary</h3>
                <p className="leading-6 text-slate-200">{summary.executiveSummary}</p>
              </div>
              {summary.keyPoints?.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Key Points</h3>
                  <ul className="space-y-2 text-slate-200">
                    {summary.keyPoints.map((point, i) => (
                      <li className="flex gap-2" key={i}>
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {summary.importantTechnologies?.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Important Technologies</h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.importantTechnologies.map((tech) => (
                      <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200" key={tech}>
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {summary.importantDates?.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Important Dates</h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.importantDates.map((d) => (
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300" key={d}>
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {summary.actionItems?.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Action Items</h3>
                  <ul className="space-y-2 text-slate-200">
                    {summary.actionItems.map((item, i) => (
                      <li className="flex gap-2" key={i}>
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
