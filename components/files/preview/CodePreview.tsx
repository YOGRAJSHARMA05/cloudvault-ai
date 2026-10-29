"use client";

import hljs from "highlight.js/lib/common";
import { useMemo } from "react";
import { usePreviewText } from "@/hooks/usePreviewText";
import { PreviewError, PreviewSkeleton } from "./PreviewStates";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  sh: "bash",
  sql: "sql",
  html: "xml",
  css: "css",
  scss: "scss",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  toml: "ini",
  ini: "ini",
};

export function CodePreview({
  url,
  extension,
}: {
  url: string;
  extension: string;
}) {
  const { text, loading, error } = usePreviewText(url);

  const highlighted = useMemo(() => {
    if (!text) return null;
    const language = LANGUAGE_BY_EXTENSION[extension];
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(text, { language }).value;
      }
      return hljs.highlightAuto(text).value;
    } catch {
      return null;
    }
  }, [extension, text]);

  if (loading) return <PreviewSkeleton />;
  if (error) return <PreviewError href={url} message={error} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0a0f1a]">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {extension}
        </span>
        <span className="text-xs text-slate-600">{text.split("\n").length.toLocaleString()} lines</span>
      </div>
      <div className="max-h-[72vh] overflow-auto">
        {highlighted !== null ? (
          <pre className="hljs m-0 overflow-visible bg-transparent p-5 text-sm leading-6">
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        ) : (
          <pre className="whitespace-pre-wrap break-words p-5 text-sm leading-6 text-slate-200">{text}</pre>
        )}
      </div>
    </div>
  );
}
