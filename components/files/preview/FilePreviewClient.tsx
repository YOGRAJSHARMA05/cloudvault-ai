"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { AISummary } from "@/components/files/ai/AIInsights";
import { SmartKeywords } from "@/components/files/ai/SmartKeywords";
import { SmartInsights } from "@/components/files/ai/SmartInsights";
import { DocumentSearch } from "@/components/files/ai/DocumentSearch";
import { SmartTags } from "@/components/files/ai/SmartTags";
import { SimilarDocuments } from "@/components/files/ai/SimilarDocuments";
import { DocumentChat } from "@/components/ai/DocumentChat";
import { PreviewSkeleton } from "./PreviewStates";
import { CodePreview } from "./CodePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { CsvPreview } from "./CsvPreview";
import { JsonPreview } from "./JsonPreview";
import { DocxPreview } from "./DocxPreview";
import { MediaPreview } from "./MediaPreview";

type FileData = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: string;
  folder: string;
  folderName: string;
  createdAt: string;
  updatedAt: string;
};

const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "h", "cpp",
  "hpp", "cs", "php", "swift", "kt", "sh", "sql", "html", "css", "scss",
  "yml", "yaml", "xml", "toml", "ini",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function formatBytes(value: string | bigint | number): string {
  const bytes = typeof value === "bigint" ? Number(value) : Number(value);
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <PreviewSkeleton />,
});

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.text();
      })
      .then((data) => {
        if (!cancelled) {
          setText(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) return <PreviewSkeleton />;
  if (error) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] px-6 text-center">
        <p className="text-sm font-medium text-rose-200">Failed to load text</p>
        <p className="mt-2 text-sm text-slate-500">Please try again or download the file.</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-2xl border border-white/8 bg-[#0a0f1a] p-6">
      <pre className="whitespace-pre-wrap break-words text-sm text-slate-200">{text}</pre>
    </div>
  );
}

function isPreviewable(extension: string): boolean {
  return (
    extension === "pdf" ||
    extension === "txt" ||
    extension === "md" ||
    extension === "markdown" ||
    extension === "csv" ||
    extension === "json" ||
    extension === "docx" ||
    extension === "mp4" ||
    extension === "mp3" ||
    IMAGE_EXTENSIONS.has(extension) ||
    CODE_EXTENSIONS.has(extension)
  );
}

export function FilePreviewClient({ file }: { file: FileData }) {
  const fileUrl = `/files/${file.id}?inline=true`;
  const downloadUrl = `/files/${file.id}`;
  const ext = file.extension.toLowerCase();
  const supported = isPreviewable(ext);

  return (
    <div className="min-h-screen bg-[#080d18] text-white">
      <header className="sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-4 border-b border-white/7 bg-[#080d18]/90 px-5 backdrop-blur-xl sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="rounded-lg px-2.5 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
            href="/dashboard"
          >
            ← Back to dashboard
          </Link>
          <div className="hidden h-6 w-px bg-white/10 sm:block" />
          <h1 className="min-w-0 truncate text-sm font-medium text-white sm:text-base" title={file.originalName}>
            {file.originalName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button href={`/share?file=${file.id}`} variant="ghost">
            Share
          </Button>
          <Button href={downloadUrl} variant="secondary">
            Download
          </Button>
        </div>
      </header>

      <main className="px-5 pb-12 pt-6 sm:px-8 sm:pt-8">
        <Container className="max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0">
              {!supported ? (
                <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] px-6 text-center">
                  <p className="text-base font-semibold text-white">Preview not available</p>
                  <p className="mt-2 max-w-sm text-sm text-slate-400">
                    This file type (.{ext}) is not supported for preview. You can download it instead.
                  </p>
                  <Button className="mt-6" href={downloadUrl} variant="primary">
                    Download file
                  </Button>
                </div>
              ) : ext === "pdf" ? (
                <PdfViewer url={fileUrl} />
              ) : ext === "txt" ? (
                <TextPreview url={fileUrl} />
              ) : ext === "md" || ext === "markdown" ? (
                <MarkdownPreview url={fileUrl} />
              ) : ext === "csv" ? (
                <CsvPreview url={fileUrl} />
              ) : ext === "json" ? (
                <JsonPreview url={fileUrl} />
              ) : ext === "docx" ? (
                <DocxPreview downloadUrl={downloadUrl} fileId={file.id} />
              ) : ext === "mp4" ? (
                <MediaPreview fileName={file.originalName} kind="video" url={fileUrl} />
              ) : ext === "mp3" ? (
                <MediaPreview fileName={file.originalName} kind="audio" url={fileUrl} />
              ) : IMAGE_EXTENSIONS.has(ext) ? (
                <MediaPreview fileName={file.originalName} kind="image" url={fileUrl} />
              ) : (
                <CodePreview extension={ext} url={fileUrl} />
              )}
            </section>

            <aside className="flex h-fit flex-col gap-4">
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                <h2 className="text-base font-semibold text-white">File information</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
                    <dt className="text-slate-500">Name</dt>
                    <dd className="break-all text-right text-slate-200">{file.originalName}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
                    <dt className="text-slate-500">Size</dt>
                    <dd className="text-right text-slate-200">{formatBytes(file.size)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
                    <dt className="text-slate-500">Type</dt>
                    <dd className="text-right text-slate-200">{file.mimeType}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
                    <dt className="text-slate-500">Extension</dt>
                    <dd className="text-right text-slate-200">.{file.extension}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
                    <dt className="text-slate-500">Upload date</dt>
                    <dd className="text-right text-slate-200">{formatDate(file.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
                    <dt className="text-slate-500">Last modified</dt>
                    <dd className="text-right text-slate-200">{formatDate(file.updatedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Folder</dt>
                    <dd className="text-right text-slate-200">{file.folderName || "/"}</dd>
                  </div>
                </dl>
              </div>
              <SmartTags fileId={file.id} key={`tags-${file.id}`} />
              <SimilarDocuments fileId={file.id} key={`similar-${file.id}`} />
            </aside>
          </div>

          <div className="mt-6 space-y-4">
            <DocumentChat fileId={file.id} fileName={file.originalName} />
            <AISummary fileId={file.id} />
            <SmartInsights fileId={file.id} fallbackSize={file.size} />
            <SmartKeywords fileId={file.id} />
            <DocumentSearch fileId={file.id} />
          </div>
        </Container>
      </main>
    </div>
  );
}
