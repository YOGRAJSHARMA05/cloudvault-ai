"use client";

import { useState } from "react";

type SharedFileViewProps = {
  token: string;
  fileName: string;
  extension: string;
  mimeType: string;
  size: string;
  label: string | null;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
};

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

export function SharedFileView({
  token,
  fileName,
  extension,
  mimeType,
  size,
  label,
  expiresAt,
  maxViews,
  viewCount,
}: SharedFileViewProps) {
  const [copied, setCopied] = useState(false);
  const ext = extension.toLowerCase();
  const inlineUrl = `/api/share/${token}/download?inline=true`;
  const downloadUrl = `/api/share/${token}/download`;
  const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
  const isVideo = ext === "mp4";
  const isAudio = ext === "mp3";
  const isPdf = ext === "pdf";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080d18] px-5 pb-12 pt-6 text-white sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/7 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
              <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
                <path d="M7.5 18.5h9.25a4.25 4.25 0 0 0 .55-8.464A5.75 5.75 0 0 0 6.28 9.12 4.75 4.75 0 0 0 7.5 18.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-slate-500">Shared file</p>
              <h1 className="truncate text-lg font-semibold" title={fileName}>{fileName}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="min-h-10 rounded-xl border border-white/10 px-3.5 text-sm text-slate-200 transition hover:bg-white/5"
              onClick={copyLink}
              type="button"
            >
              {copied ? "Link copied" : "Copy link"}
            </button>
            <a
              className="inline-flex min-h-10 items-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400"
              href={downloadUrl}
            >
              Download
            </a>
          </div>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0">
            {isImage ? (
              <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={fileName} className="max-h-[72vh] max-w-full rounded-xl object-contain" src={inlineUrl} />
              </div>
            ) : isVideo ? (
              <div className="overflow-hidden rounded-2xl border border-white/8 bg-black">
                <video className="max-h-[72vh] w-full" controls preload="metadata" src={inlineUrl} />
              </div>
            ) : isAudio ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8">
                <audio className="w-full" controls preload="metadata" src={inlineUrl} />
              </div>
            ) : isPdf ? (
              <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
                <object className="h-[72vh] min-h-[480px] w-full" data={inlineUrl} type={mimeType}>
                  <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                    <p className="text-sm text-slate-300">Inline PDF viewing is not available.</p>
                    <a className="mt-4 text-sm font-medium text-blue-300 hover:text-blue-200" href={downloadUrl}>Download PDF</a>
                  </div>
                </object>
              </div>
            ) : (
              <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] px-6 text-center">
                <p className="text-base font-semibold text-white">Preview not available</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  This {ext ? `.${ext}` : ""} file can be downloaded to your device.
                </p>
                <a className="mt-6 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400" href={downloadUrl}>
                  Download file
                </a>
              </div>
            )}
          </section>

          <aside className="h-fit rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="text-base font-semibold text-white">Shared details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              {label ? (
                <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
                  <dt className="text-slate-500">Label</dt>
                  <dd className="break-all text-right text-slate-200">{label}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
                <dt className="text-slate-500">Size</dt>
                <dd className="text-slate-200">{formatBytes(size)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
                <dt className="text-slate-500">Type</dt>
                <dd className="text-right text-slate-200">{mimeType}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
                <dt className="text-slate-500">Views</dt>
                <dd className="text-slate-200">
                  {viewCount}
                  {maxViews ? ` / ${maxViews}` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Expires</dt>
                <dd className="text-right text-slate-200">
                  {expiresAt ? formatDate(expiresAt) : "Never"}
                </dd>
              </div>
            </dl>
            <p className="mt-5 border-t border-white/5 pt-4 text-xs leading-5 text-slate-600">
              Only people with this link can access the file. Do not share it publicly unless intended.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
