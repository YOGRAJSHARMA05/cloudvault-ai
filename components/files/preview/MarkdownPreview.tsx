"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePreviewText } from "@/hooks/usePreviewText";
import { PreviewError, PreviewSkeleton } from "./PreviewStates";

export function MarkdownPreview({ url }: { url: string }) {
  const { text, loading, error } = usePreviewText(url);

  if (loading) return <PreviewSkeleton label="Rendering Markdown..." />;
  if (error) return <PreviewError href={url} message={error} />;

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl border border-white/8 bg-white/[0.02] p-6 text-slate-200">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-6 text-2xl font-semibold text-white first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-6 text-xl font-semibold text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold text-white">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold text-white">{children}</h4>,
          p: ({ children }) => <p className="mb-3 text-sm leading-7 text-slate-300">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-300">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-300">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ children, href }) => (
            <a className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200" href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-blue-400/40 pl-4 text-sm italic text-slate-400">{children}</blockquote>
          ),
          code: ({ children, className }) => (
            <code className={`rounded bg-white/8 px-1.5 py-0.5 text-[0.85em] text-blue-200 ${className ?? ""}`}>{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="mb-4 overflow-auto rounded-xl border border-white/8 bg-[#0a0f1a] p-4 text-sm leading-6">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="mb-4 overflow-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-white/10 bg-white/5 px-3 py-2 text-left font-semibold text-white">{children}</th>,
          td: ({ children }) => <td className="border border-white/10 px-3 py-2 text-slate-300">{children}</td>,
          hr: () => <hr className="my-5 border-white/10" />,
        }}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
