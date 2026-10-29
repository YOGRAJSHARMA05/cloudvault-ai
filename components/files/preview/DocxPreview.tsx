"use client";

import { useEffect, useState } from "react";
import { PreviewError, PreviewSkeleton } from "./PreviewStates";

export function DocxPreview({
  fileId,
  downloadUrl,
}: {
  fileId: string;
  downloadUrl: string;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/${fileId}/docx`)
      .then(async (response) => {
        const data = (await response.json()) as { text?: string; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Failed to read the document.");
        return data.text ?? "";
      })
      .then((value) => {
        if (!cancelled) {
          setText(value);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to read the document.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (loading) return <PreviewSkeleton label="Converting document..." />;
  if (error) return <PreviewError href={downloadUrl} message={error} />;

  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl border border-white/8 bg-white/[0.02] p-6">
      {paragraphs.length ? (
        <div className="space-y-4">
          {paragraphs.map((paragraph, index) => (
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300" key={index}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">This document does not contain extractable text.</p>
      )}
      <p className="mt-6 border-t border-white/8 pt-4 text-xs text-slate-600">
        Text extracted from the DOCX file. Formatting, images, and layout are not shown in preview.
      </p>
    </div>
  );
}
