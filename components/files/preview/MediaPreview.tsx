"use client";

export function MediaPreview({
  url,
  fileName,
  kind,
}: {
  url: string;
  fileName: string;
  kind: "image" | "video" | "audio";
}) {
  if (kind === "video") {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-black">
        <video className="max-h-[72vh] w-full" controls preload="metadata" src={url}>
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8">
        <div className="flex flex-col items-center gap-5">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300">
            <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24">
              <path d="M9 18V6l10-2v12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
              <circle cx="6.5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="16.5" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          <p className="max-w-full break-words text-center text-sm font-medium text-slate-200">{fileName}</p>
          <audio className="w-full" controls preload="metadata" src={url}>
            Your browser does not support audio playback.
          </audio>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={fileName} className="max-h-[72vh] max-w-full rounded-xl object-contain" src={url} />
    </div>
  );
}
