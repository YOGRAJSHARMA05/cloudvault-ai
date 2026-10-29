"use client";

import { useEffect, useState } from "react";

type Metadata = {
  pageCount: number | null;
  wordCount: number | null;
  characterCount: number | null;
  readingTimeMinutes: number | null;
  language: string | null;
  headingsCount: number | null;
  paragraphsCount: number | null;
  fileSize: string | null;
  fileType: string | null;
};

function formatBytes(value: string | null): string {
  if (!value) return "-";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

export function SmartInsights({ fileId, fallbackSize }: { fileId: string; fallbackSize?: string }) {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/files/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Failed to extract insights");
          return;
        }
        setMetadata(data.metadata);
      } catch {
        if (!cancelled) setError("Failed to extract insights");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fileId, reloadKey]);

  function retry() {
    setLoading(true);
    setError("");
    setReloadKey((value) => value + 1);
  }

  const items = [
    { label: "Pages", value: metadata?.pageCount?.toString() || "-" },
    { label: "Words", value: metadata?.wordCount?.toLocaleString() || "-" },
    { label: "Characters", value: metadata?.characterCount?.toLocaleString() || "-" },
    { label: "Reading time", value: metadata?.readingTimeMinutes ? `${metadata.readingTimeMinutes} min` : "-" },
    { label: "Headings", value: metadata?.headingsCount?.toString() || "-" },
    { label: "Paragraphs", value: metadata?.paragraphsCount?.toString() || "-" },
    { label: "Language", value: metadata?.language || "-" },
    { label: "File size", value: metadata?.fileSize ? formatBytes(metadata.fileSize) : fallbackSize || "-" },
  ];

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Smart Insights</h2>
          <p className="mt-1 text-xs text-slate-500">Document statistics and metadata</p>
        </div>
        {error ? (
          <button className="text-sm text-blue-300 hover:text-blue-200" onClick={retry} type="button">
            Retry
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="rounded-xl border border-white/8 p-3" key={i}>
              <div className="h-2 w-12 animate-pulse rounded bg-white/5" />
              <div className="mt-2 h-4 w-16 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : null}
      {!loading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <div className="rounded-xl border border-white/8 p-3" key={item.label}>
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm font-medium text-white">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
