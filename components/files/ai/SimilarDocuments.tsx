"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SimilarDocumentView } from "@/types/ai";

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

export function SimilarDocuments({ fileId }: { fileId: string }) {
  const [similar, setSimilar] = useState<SimilarDocumentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/${encodeURIComponent(fileId)}/similar?limit=5`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        return response.json() as Promise<{ similar?: SimilarDocumentView[] }>;
      })
      .then((data) => {
        if (!cancelled) setSimilar(data.similar ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (error) return null;

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Similar documents</h2>
          <p className="mt-1.5 text-xs text-slate-500">
            Related files in your workspace based on content, tags, and file names.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
          AI
        </span>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((index) => (
            <div className="h-12 animate-pulse rounded-xl bg-white/5" key={index} />
          ))}
        </div>
      ) : similar.length ? (
        <ul className="mt-4 space-y-2">
          {similar.map((item) => (
            <li key={item.id}>
              <Link
                className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.04]"
                href={`/files/${item.id}/preview`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200" title={item.originalName}>
                    {item.originalName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {item.extension.toUpperCase()} · {formatBytes(item.size)} · {item.folderName}
                  </p>
                  {item.sharedTags.length ? (
                    <p className="mt-1 truncate text-[11px] text-blue-300/80">
                      Shared: {item.sharedTags.join(", ")}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-200">
                  {Math.round(item.score * 100)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-slate-500">
          No similar documents found yet. Upload more related files to unlock recommendations.
        </p>
      )}
    </section>
  );
}
