"use client";

import { useMemo } from "react";
import { usePreviewText } from "@/hooks/usePreviewText";
import { PreviewError, PreviewSkeleton } from "./PreviewStates";

export function JsonPreview({ url }: { url: string }) {
  const { text, loading, error } = usePreviewText(url);

  const formatted = useMemo(() => {
    if (!text.trim()) return { value: "", valid: false };
    try {
      return { value: JSON.stringify(JSON.parse(text), null, 2), valid: true };
    } catch {
      return { value: text, valid: false };
    }
  }, [text]);

  if (loading) return <PreviewSkeleton label="Formatting JSON..." />;
  if (error) return <PreviewError href={url} message={error} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0a0f1a]">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5 text-xs text-slate-500">
        <span>JSON</span>
        {!formatted.valid ? <span className="text-amber-200/80">Invalid JSON · showing raw content</span> : null}
      </div>
      <pre className="max-h-[72vh] overflow-auto whitespace-pre-wrap break-words p-5 text-sm leading-6 text-slate-200">
        {formatted.value}
      </pre>
    </div>
  );
}
