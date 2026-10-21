"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  FILE_PAGE_SIZE,
  MAX_FILE_SIZE_BYTES,
  type FileCategory,
  type FileSort,
} from "@/constants/files";
import {
  deleteUserFile,
  getDashboardStats,
  listUserFiles,
  renameUserFile,
  toggleFileFavorite,
  uploadUserFile,
} from "@/app/actions/files";
import type { DashboardStats, FileRecordView } from "@/types/files";

type Props = {
  userName: string | null;
  initialFiles: FileRecordView[];
  initialTotal: number;
  initialStats: DashboardStats;
  signOutAction: () => Promise<void>;
};

type DialogState =
  | { type: "rename"; file: FileRecordView }
  | { type: "delete"; file: FileRecordView }
  | { type: "details"; file: FileRecordView }
  | null;

const categories: { value: FileCategory; label: string }[] = [
  { value: "all", label: "All files" },
  { value: "images", label: "Images" },
  { value: "documents", label: "Documents" },
  { value: "pdf", label: "PDF" },
  { value: "videos", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
  { value: "favorites", label: "Favorites" },
];

const sortOptions: { value: FileSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "largest", label: "Largest first" },
  { value: "smallest", label: "Smallest first" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
];

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
  }).format(new Date(value));
}

function FileGlyph({ extension }: { extension: string }) {
  const image = ["png", "jpg", "jpeg", "webp"].includes(extension);
  const color = image
    ? "text-violet-300 bg-violet-400/10"
    : extension === "pdf"
      ? "text-rose-300 bg-rose-400/10"
      : "text-blue-300 bg-blue-400/10";

  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
      <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
        {image ? (
          <>
            <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.6" width="18" x="3" y="4" />
            <circle cx="8.5" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m4 17 5-5 3 3 3-4 5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </>
        ) : (
          <>
            <path d="M7 3.75h6.5L19 9.25v11A1.75 1.75 0 0 1 17.25 22h-10A1.75 1.75 0 0 1 5.5 20.25v-14A2.5 2.5 0 0 1 8 3.75Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
            <path d="M13 4v5h5M8.5 14h7m-7 3h7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </>
        )}
      </svg>
    </span>
  );
}

function StatIcon({ kind }: { kind: "storage" | "files" | "favorites" | "average" }) {
  const paths = {
    storage: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" /><path d="M4 9h16m-4 5h1" /></>,
    files: <><path d="M7 4.75h8l4 4v10.5A1.75 1.75 0 0 1 17.25 21h-10A1.75 1.75 0 0 1 5.5 19.25v-12A2.5 2.5 0 0 1 8 4.75Z" /><path d="M14.5 5v4h4M8.5 13h7m-7 3h7" /></>,
    favorites: <path d="m12 3.75 2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.77l-5.1 2.68.97-5.68-4.12-4.02 5.7-.83L12 3.75Z" />,
    average: <><path d="M4 18.5V12m5 6.5V6m5 12.5v-9m5 9V4" /><path d="M2.75 20h18.5" /></>,
  };

  return (
    <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
      {paths[kind]}
    </svg>
  );
}

export function FilesDashboard({ userName, initialFiles, initialTotal, initialStats, signOutAction }: Props) {
  const [files, setFiles] = useState(initialFiles);
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState(initialStats);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FileCategory>("all");
  const [sort, setSort] = useState<FileSort>("newest");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toast, setToast] = useState("");
  const [listError, setListError] = useState("");
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (nextPage = page) => {
    try {
      const [result, nextStats] = await Promise.all([
        listUserFiles({ query, category, sort, page: nextPage }),
        getDashboardStats(),
      ]);
      setFiles(result.files);
      setTotal(result.total);
      setPage(nextPage);
      setStats(nextStats);
      setListError("");
    } catch {
      setListError("Please check your connection and try again.");
    }
  }, [category, page, query, sort]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const nextPage = 1;
      setListError("");
      startTransition(() => {
        void listUserFiles({ query, category, sort, page: nextPage }).then((result) => {
          setFiles(result.files);
          setTotal(result.total);
          setPage(nextPage);
        }).catch(() => setListError("Please check your connection and try again."));
      });
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [category, query, sort]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const totalPages = Math.max(1, Math.ceil(total / FILE_PAGE_SIZE));

  function uploadFiles(selected: FileList | File[]) {
    const queue = Array.from(selected);
    if (!queue.length) return;

    startTransition(async () => {
      setUploadCount(queue.length);
      let uploaded = 0;
      for (const [index, file] of queue.entries()) {
        setUploadCurrent(index + 1);
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setToast(`${file.name}: files must be 25 MB or smaller.`);
          continue;
        }
        const data = new FormData();
        data.set("file", file);
        try {
          const result = await uploadUserFile(data);
          if (!result.success) setToast(`${file.name}: ${result.message}`);
          else {
            uploaded += 1;
            setToast(result.message);
          }
        } catch {
          setToast(`${file.name}: the upload failed. Please try again.`);
        }
      }
      setUploadCount(0);
      setUploadCurrent(0);
      await refresh(1);
      if (fileInput.current) fileInput.current.value = "";
      if (uploaded > 1) setToast(`${uploaded} files uploaded successfully.`);
    });
  }

  function runFileAction(action: () => Promise<{ success: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setToast(result.message);
      if (result.success) {
        setDialog(null);
        await refresh();
      }
    });
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.type !== "rename") return;
    runFileAction(() => renameUserFile({ fileId: dialog.file.id, name: renameValue }));
  }

  const usedLabel = formatBytes(stats.totalBytes);

  return (
    <div className="min-h-screen flex-1 bg-[#080d18] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/7 px-5 py-7 lg:flex lg:flex-col">
          <Link aria-label="CloudVault AI home" className="flex items-center gap-3 px-2" href="/">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
              <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
                <path d="M7.5 18.5h9.25a4.25 4.25 0 0 0 .55-8.464A5.75 5.75 0 0 0 6.28 9.12 4.75 4.75 0 0 0 7.5 18.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                <path d="M9.5 14.25h5m-5 0 1.75-1.75M9.5 14.25 11.25 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
            </span>
            <span className="text-base font-semibold tracking-tight">CloudVault <span className="text-blue-300">AI</span></span>
          </Link>

          <button
            className="mt-10 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold shadow-lg shadow-blue-950/25 transition hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <span aria-hidden="true" className="text-lg">+</span> Upload files
          </button>

          <nav aria-label="File views" className="mt-8 space-y-1">
            {categories.map((item) => (
              <button
                aria-current={category === item.value ? "page" : undefined}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${category === item.value ? "bg-blue-500/10 font-medium text-blue-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
                key={item.value}
                onClick={() => { setCategory(item.value); setPage(1); }}
                type="button"
              >
                <CategoryGlyph category={item.value} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">Storage used</span>
              <span className="text-slate-400">{usedLabel}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">Across your uploaded files</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-4 border-b border-white/7 bg-[#080d18]/90 px-5 backdrop-blur-xl sm:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300" aria-hidden="true">C</span>
              <span className="truncate text-sm font-semibold">CloudVault <span className="text-blue-300">AI</span></span>
            </div>
            <div className="relative hidden w-full max-w-xl md:block">
              <svg aria-hidden="true" className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24">
                <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7" />
                <path d="m16 16 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
              </svg>
              <input aria-label="Search files" className="h-10 w-full rounded-xl border border-white/8 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400/50" onChange={(event) => setQuery(event.target.value)} placeholder="Search files by name, type, or extension…" value={query} />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <button className="flex size-10 items-center justify-center rounded-xl border border-white/8 text-slate-400 transition hover:bg-white/5 hover:text-white md:hidden" onClick={() => document.getElementById("mobile-file-search")?.focus()} type="button" aria-label="Search files">
                <span aria-hidden="true">⌕</span>
              </button>
              <div className="flex size-9 items-center justify-center rounded-full border border-blue-300/20 bg-blue-400/10 text-xs font-semibold text-blue-200" title={userName ?? "Account"}>
                {(userName?.trim().charAt(0) || "U").toUpperCase()}
              </div>
              <span className="hidden max-w-36 truncate text-sm text-slate-300 sm:block">{userName ?? "My workspace"}</span>
              <form action={signOutAction}>
                <button className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white" type="submit">Sign out</button>
              </form>
            </div>
          </header>

          <main className="px-5 pb-12 pt-8 sm:px-8 sm:pt-10">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm text-slate-500">Your workspace</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">My files</h1>
                <p className="mt-2 text-sm text-slate-400">A secure home for everything you need.</p>
              </div>
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/25 transition hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 lg:hidden" onClick={() => fileInput.current?.click()} type="button">
                <span aria-hidden="true" className="text-lg">+</span> Upload files
              </button>
            </div>

            <input
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
              className="sr-only"
              multiple
              onChange={(event) => { if (event.currentTarget.files) uploadFiles(event.currentTarget.files); }}
              ref={fileInput}
              type="file"
            />

            <section aria-label="Storage overview" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon="storage" label="Storage used" value={usedLabel} detail="across your files" />
              <StatCard icon="files" label="Total files" value={stats.totalFiles.toLocaleString()} detail="in your workspace" />
              <StatCard icon="favorites" label="Favorites" value={stats.favoriteFiles.toLocaleString()} detail="quick access files" />
              <StatCard icon="average" label="Average file size" value={formatBytes(stats.averageBytes)} detail="across your files" />
            </section>

            <section
              aria-label="File upload drop zone"
              className={`mt-7 rounded-2xl border border-dashed px-5 py-6 text-center transition ${dragging ? "border-blue-300 bg-blue-500/10" : "border-white/12 bg-white/[0.015] hover:border-white/20"}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); setDragging(false); uploadFiles(event.dataTransfer.files); }}
            >
              {uploadCount > 0 ? (
                <div aria-live="polite" className="mx-auto flex max-w-md items-center justify-center gap-3 text-sm text-blue-200" role="status">
                  <span className="size-4 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" />
                  Uploading file {uploadCurrent} of {uploadCount}…
                  <span className="sr-only">Upload in progress</span>
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  <button className="font-medium text-blue-300 hover:text-blue-200" onClick={() => fileInput.current?.click()} type="button">Click to upload</button>
                  <span> or drag files here</span>
                  <span className="mt-1 block text-xs text-slate-600">PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, WEBP · up to 25 MB each</span>
                </p>
              )}
            </section>

            <section aria-labelledby="files-heading" className="mt-9">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white" id="files-heading">{categories.find((item) => item.value === category)?.label}</h2>
                  <p className="mt-1 text-xs text-slate-500">{total.toLocaleString()} {total === 1 ? "file" : "files"}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input aria-label="Search files" className="h-10 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400/50 md:hidden" id="mobile-file-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search files…" value={query} />
                  <label className="sr-only" htmlFor="file-filter">Filter files</label>
                  <select className="h-10 rounded-xl border border-white/8 bg-[#0d1422] px-3 text-sm text-slate-300 outline-none focus:border-blue-400/50" id="file-filter" onChange={(event) => { setCategory(event.target.value as FileCategory); setPage(1); }} value={category}>
                    {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <label className="sr-only" htmlFor="file-sort">Sort files</label>
                  <select className="h-10 rounded-xl border border-white/8 bg-[#0d1422] px-3 text-sm text-slate-300 outline-none focus:border-blue-400/50" id="file-sort" onChange={(event) => setSort(event.target.value as FileSort)} value={sort}>
                    {sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
                <div className="hidden grid-cols-[minmax(220px,1fr)_110px_100px_130px_150px] gap-4 border-b border-white/7 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500 md:grid">
                  <span>File name</span><span>Type</span><span>Size</span><span>Created</span><span className="text-right">Actions</span>
                </div>

                {listError ? (
                  <div className="px-6 py-14 text-center">
                    <h3 className="text-sm font-semibold text-rose-200">Files couldn’t be loaded</h3>
                    <p className="mt-2 text-sm text-slate-500">{listError}</p>
                    <button className="mt-4 text-sm font-medium text-blue-300 hover:text-blue-200" onClick={() => { startTransition(() => { void refresh().catch(() => undefined); }); }} type="button">Try again</button>
                  </div>
                ) : busy && files.length === 0 ? (
                  <div aria-label="Loading files" className="divide-y divide-white/[0.055]" role="status">
                    {Array.from({ length: 5 }, (_, index) => (
                      <div className="flex items-center gap-3 px-5 py-4" key={index}>
                        <span className="size-10 animate-pulse rounded-xl bg-white/5" />
                        <span className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
                      </div>
                    ))}
                    <span className="sr-only">Loading files…</span>
                  </div>
                ) : files.length ? (
                  <ul aria-busy={busy} className="divide-y divide-white/[0.055]">
                    {files.map((file) => (
                      <FileRow
                        file={file}
                        key={file.id}
                        onDelete={() => setDialog({ type: "delete", file })}
                        onDetails={() => setDialog({ type: "details", file })}
                        onFavorite={() => runFileAction(() => toggleFileFavorite({ fileId: file.id }))}
                        onRename={() => { setRenameValue(file.originalName.replace(/\.[^.]+$/, "")); setDialog({ type: "rename", file }); }}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="px-6 py-16 text-center">
                    <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300">
                      <StatIcon kind="files" />
                    </span>
                    <h3 className="mt-5 text-base font-semibold text-white">{query ? "No files match your search" : category === "favorites" ? "No favorites yet" : "Your files will appear here"}</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{query ? "Try a different name, file type, or extension." : "Upload your first document or image to get your workspace started."}</p>
                    {!query && category === "all" ? <button className="mt-5 text-sm font-medium text-blue-300 hover:text-blue-200" onClick={() => fileInput.current?.click()} type="button">Upload a file</button> : null}
                  </div>
                )}
              </div>

              {totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                  <span>Page {page} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button className="rounded-lg border border-white/10 px-3 py-2 transition hover:bg-white/5 disabled:opacity-40" disabled={page <= 1 || busy} onClick={() => { const next = page - 1; startTransition(() => { void refresh(next); }); }} type="button">Previous</button>
                    <button className="rounded-lg border border-white/10 px-3 py-2 transition hover:bg-white/5 disabled:opacity-40" disabled={page >= totalPages || busy} onClick={() => { const next = page + 1; startTransition(() => { void refresh(next); }); }} type="button">Next</button>
                  </div>
                </div>
              ) : null}
            </section>
          </main>
        </div>
      </div>

      {toast ? (
        <div aria-live="polite" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-2xl" role="status">{toast}</div>
      ) : null}

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section aria-labelledby="file-dialog-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101827] p-6 shadow-2xl" role="dialog">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-white" id="file-dialog-title">{dialog.type === "rename" ? "Rename file" : dialog.type === "delete" ? "Delete file?" : "File information"}</h2>
              <button aria-label="Close dialog" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-white/5 hover:text-white" onClick={() => setDialog(null)} type="button">×</button>
            </div>

            {dialog.type === "rename" ? (
              <form className="mt-5" onSubmit={submitRename}>
                <label className="mb-2 block text-sm text-slate-300" htmlFor="rename-file">File name</label>
                <div className="flex items-center gap-2">
                  <input autoFocus className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50" id="rename-file" maxLength={180} onChange={(event) => setRenameValue(event.target.value)} value={renameValue} />
                  <span className="text-sm text-slate-500">.{dialog.file.extension}</span>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogButton onClick={() => setDialog(null)}>Cancel</DialogButton>
                  <DialogButton disabled={busy || !renameValue.trim()} primary type="submit">{busy ? "Saving…" : "Save name"}</DialogButton>
                </div>
              </form>
            ) : dialog.type === "delete" ? (
              <>
                <p className="mt-3 break-words text-sm leading-6 text-slate-400">This will permanently delete <span className="font-medium text-slate-200">{dialog.file.originalName}</span> and its stored file. This action cannot be undone.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogButton disabled={busy} onClick={() => setDialog(null)}>Cancel</DialogButton>
                  <DialogButton danger disabled={busy} onClick={() => runFileAction(() => deleteUserFile({ fileId: dialog.file.id }))}>{busy ? "Deleting…" : "Delete file"}</DialogButton>
                </div>
              </>
            ) : (
              <dl className="mt-5 space-y-3 text-sm">
                <DetailRow label="Name" value={dialog.file.originalName} />
                <DetailRow label="Type" value={dialog.file.mimeType} />
                <DetailRow label="Size" value={formatBytes(dialog.file.size)} />
                <DetailRow label="Created" value={formatDate(dialog.file.createdAt)} />
                <DetailRow label="Updated" value={formatDate(dialog.file.updatedAt)} />
                <DetailRow label="Favorite" value={dialog.file.isFavorite ? "Yes" : "No"} />
              </dl>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function CategoryGlyph({ category }: { category: FileCategory }) {
  return <span aria-hidden="true" className="w-4 text-center text-xs">{category === "favorites" ? "☆" : category === "images" ? "▧" : category === "documents" || category === "pdf" ? "▤" : category === "videos" ? "▷" : category === "audio" ? "♫" : "◫"}</span>;
}

function StatCard({ icon, label, value, detail }: { icon: "storage" | "files" | "favorites" | "average"; label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 transition hover:border-white/12 hover:bg-white/[0.04]">
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        <span className="text-blue-300"><StatIcon kind={icon} /></span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function FileRow({ file, onFavorite, onRename, onDelete, onDetails }: {
  file: FileRecordView;
  onFavorite: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDetails: () => void;
}) {
  return (
    <li className="grid grid-cols-1 gap-3 px-4 py-4 transition hover:bg-white/[0.025] sm:px-5 md:grid-cols-[minmax(220px,1fr)_110px_100px_130px_150px] md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <FileGlyph extension={file.extension} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100" title={file.originalName}>{file.originalName}</p>
          <p className="mt-1 text-xs text-slate-500 md:hidden">{file.extension.toUpperCase()} · {formatBytes(file.size)} · {formatDate(file.createdAt)}</p>
        </div>
        {file.isFavorite ? <span aria-label="Favorite" className="text-amber-300" title="Favorite">★</span> : null}
      </div>
      <span className="hidden text-xs uppercase text-slate-400 md:block">{file.extension}</span>
      <span className="hidden text-sm text-slate-400 md:block">{formatBytes(file.size)}</span>
      <span className="hidden text-sm text-slate-400 md:block">{formatDate(file.createdAt)}</span>
      <div className="flex items-center justify-end gap-1">
        <button aria-label={file.isFavorite ? `Remove ${file.originalName} from favorites` : `Add ${file.originalName} to favorites`} className={`flex size-9 items-center justify-center rounded-lg transition hover:bg-white/7 ${file.isFavorite ? "text-amber-300" : "text-slate-500 hover:text-amber-300"}`} onClick={onFavorite} type="button">{file.isFavorite ? "★" : "☆"}</button>
        <a aria-label={`Download ${file.originalName}`} className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/7 hover:text-blue-200" href={`/files/${file.id}`} title="Download">
          <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24"><path d="M12 3.5v11m0 0 4-4m-4 4-4-4M5 16v3.25A1.75 1.75 0 0 0 6.75 21h10.5A1.75 1.75 0 0 0 19 19.25V16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
        </a>
        <details className="relative">
          <summary aria-label={`Actions for ${file.originalName}`} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/7 hover:text-white [&::-webkit-details-marker]:hidden">•••</summary>
          <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-white/10 bg-[#111a29] p-1.5 shadow-xl">
            <MenuButton onClick={onDetails}>View details</MenuButton>
            <MenuButton onClick={onRename}>Rename</MenuButton>
            <MenuButton onClick={onFavorite}>{file.isFavorite ? "Remove favorite" : "Add to favorites"}</MenuButton>
            <a className="block rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white" href={`/files/${file.id}`}>Download</a>
            <MenuButton danger onClick={onDelete}>Delete</MenuButton>
          </div>
        </details>
      </div>
    </li>
  );
}

function MenuButton({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${danger ? "text-rose-300 hover:bg-rose-400/10" : "text-slate-300 hover:bg-white/5 hover:text-white"}`} onClick={(event) => { onClick(); const details = event.currentTarget.closest("details"); if (details) details.open = false; }} type="button">{children}</button>;
}

function DialogButton({ children, onClick, primary = false, danger = false, disabled = false, type = "button" }: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return <button className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${danger ? "bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" : primary ? "bg-blue-500 text-white hover:bg-blue-400" : "text-slate-300 hover:bg-white/5"}`} disabled={disabled} onClick={onClick} type={type}>{children}</button>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-b border-white/5 pb-3 last:border-0"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="break-all text-right text-slate-200">{value}</dd></div>;
}