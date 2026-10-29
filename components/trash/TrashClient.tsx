"use client";

import { useState, useTransition } from "react";
import {
  emptyTrash,
  getTrashContents,
  permanentlyDeleteFile,
  permanentlyDeleteFiles,
  permanentlyDeleteFolder,
  permanentlyDeleteFolders,
  restoreTrashedFile,
  restoreTrashedFiles,
  restoreTrashedFolder,
  restoreTrashedFolders,
} from "@/app/actions/trash";
import type { TrashContents } from "@/types/trash";

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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function TrashClient({ initialContents }: { initialContents: TrashContents }) {
  const [contents, setContents] = useState(initialContents);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState("");
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, startTransition] = useTransition();

  const totalItems = contents.files.length + contents.folders.length;

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  async function refresh() {
    const next = await getTrashContents();
    setContents(next);
    setSelectedFiles(new Set());
    setSelectedFolders(new Set());
  }

  function run(action: () => Promise<{ success: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setToast(result.message);
      await refresh();
    });
  }

  function confirmPermanent(message: string, action: () => Promise<{ success: boolean; message: string }>) {
    if (window.confirm(message)) run(action);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-5">
        <div>
          <p className="text-sm text-slate-400">
            {totalItems.toLocaleString()} {totalItems === 1 ? "item" : "items"} in trash
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatBytes(contents.totalBytes)} of storage · Restore items or delete them permanently.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedFiles.size + selectedFolders.size > 0 ? (
            <>
              <button
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/5"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const results = await Promise.all([
                      selectedFiles.size ? restoreTrashedFiles({ fileIds: [...selectedFiles] }) : Promise.resolve({ success: true, message: "" }),
                      selectedFolders.size ? restoreTrashedFolders({ folderIds: [...selectedFolders] }) : Promise.resolve({ success: true, message: "" }),
                    ]);
                    return {
                      success: results.every((item) => item.success),
                      message: results.map((item) => item.message).filter(Boolean).join(" "),
                    };
                  })
                }
                type="button"
              >
                Restore selected
              </button>
              <button
                className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-400/10"
                disabled={busy}
                onClick={() =>
                  confirmPermanent("Permanently delete the selected items? This cannot be undone.", async () => {
                    const results = await Promise.all([
                      selectedFiles.size ? permanentlyDeleteFiles({ fileIds: [...selectedFiles] }) : Promise.resolve({ success: true, message: "" }),
                      selectedFolders.size ? permanentlyDeleteFolders({ folderIds: [...selectedFolders] }) : Promise.resolve({ success: true, message: "" }),
                    ]);
                    return {
                      success: results.every((item) => item.success),
                      message: results.map((item) => item.message).filter(Boolean).join(" "),
                    };
                  })
                }
                type="button"
              >
                Delete selected
              </button>
            </>
          ) : null}
          <button
            className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-40"
            disabled={busy || totalItems === 0}
            onClick={() => setConfirmEmpty(true)}
            type="button"
          >
            Empty trash
          </button>
        </div>
      </section>

      {contents.folders.length ? (
        <section>
          <h2 className="text-sm font-semibold text-slate-200">Folders</h2>
          <ul className="mt-3 space-y-2">
            {contents.folders.map((folder) => (
              <TrashRow
                checked={selectedFolders.has(folder.id)}
                key={folder.id}
                onCheck={() => setSelectedFolders((current) => toggle(current, folder.id))}
                onDelete={() => confirmPermanent(`Permanently delete ${folder.name} and everything inside it?`, () => permanentlyDeleteFolder({ folderId: folder.id }))}
                onRestore={() => run(() => restoreTrashedFolder({ folderId: folder.id }))}
                subtitle={`${folder.fileCount} files · ${folder.childCount} folders · Trashed ${formatDate(folder.deletedAt)}`}
                title={folder.name}
                type="Folder"
              />
            ))}
          </ul>
        </section>
      ) : null}

      {contents.files.length ? (
        <section>
          <h2 className="text-sm font-semibold text-slate-200">Files</h2>
          <ul className="mt-3 space-y-2">
            {contents.files.map((file) => (
              <TrashRow
                checked={selectedFiles.has(file.id)}
                key={file.id}
                onCheck={() => setSelectedFiles((current) => toggle(current, file.id))}
                onDelete={() => confirmPermanent(`Permanently delete ${file.originalName}?`, () => permanentlyDeleteFile({ fileId: file.id }))}
                onRestore={() => run(() => restoreTrashedFile({ fileId: file.id }))}
                subtitle={`${file.extension.toUpperCase()} · ${formatBytes(file.size)} · ${file.folderName} · Trashed ${formatDate(file.deletedAt)}`}
                title={file.originalName}
                type={file.extension.toUpperCase()}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {totalItems === 0 ? (
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
            <svg aria-hidden="true" className="size-7" fill="none" viewBox="0 0 24 24">
              <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
            </svg>
          </span>
          <h2 className="mt-5 text-base font-semibold text-white">Your trash is empty</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Files and folders you delete will appear here so you can restore them.
          </p>
        </section>
      ) : null}

      {confirmEmpty ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <section aria-modal="true" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101827] p-6 shadow-2xl" role="dialog">
            <h2 className="text-lg font-semibold text-white">Empty trash?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This permanently deletes {totalItems} {totalItems === 1 ? "item" : "items"} and their stored bytes. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-lg px-3.5 py-2 text-sm text-slate-300 transition hover:bg-white/5" onClick={() => setConfirmEmpty(false)} type="button">Cancel</button>
              <button
                className="rounded-lg bg-rose-500/15 px-3.5 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                disabled={busy}
                onClick={() => { setConfirmEmpty(false); run(() => emptyTrash()); }}
                type="button"
              >
                {busy ? "Emptying…" : "Empty trash"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? (
        <div aria-live="polite" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-2xl" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function TrashRow({
  title,
  subtitle,
  type,
  checked,
  onCheck,
  onRestore,
  onDelete,
}: {
  title: string;
  subtitle: string;
  type: string;
  checked: boolean;
  onCheck: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
      <input
        aria-label={`Select ${title}`}
        checked={checked}
        className="size-4 accent-blue-500"
        onChange={onCheck}
        type="checkbox"
      />
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-[10px] font-semibold text-slate-400">
        {type.slice(0, 4)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-100" title={title}>{title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/5" onClick={onRestore} type="button">Restore</button>
        <button className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-400/10" onClick={onDelete} type="button">Delete</button>
      </div>
    </li>
  );
}
