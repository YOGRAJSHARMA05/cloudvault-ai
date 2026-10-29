"use client";

import Link from "next/link";
import { useCallback, useState, useTransition, type FormEvent } from "react";
import {
  createShareLink,
  deleteShareLink,
  listShareLinks,
  revokeShareLink,
} from "@/app/actions/share";
import type {
  ShareFileOption,
  ShareLinkStatus,
  ShareLinkView,
} from "@/types/share";

type ShareManagerProps = {
  initialLinks: ShareLinkView[];
  fileOptions: ShareFileOption[];
  initialFileId: string | null;
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const statusStyles: Record<ShareLinkStatus, string> = {
  active: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  expired: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  revoked: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  exhausted: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  "file-missing": "border-rose-400/20 bg-rose-400/10 text-rose-200",
};

const statusLabels: Record<ShareLinkStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  exhausted: "View limit reached",
  "file-missing": "File unavailable",
};

export function ShareManager({ initialLinks, fileOptions, initialFileId }: ShareManagerProps) {
  const [links, setLinks] = useState(initialLinks);
  const [fileId, setFileId] = useState(initialFileId ?? fileOptions[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [maxViews, setMaxViews] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const refreshLinks = useCallback(async () => {
    const next = await listShareLinks();
    setLinks(next);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fileId) {
      setError("Choose a file to share.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createShareLink({
        fileId,
        label,
        expiresInDays: Number(expiresInDays) || 0,
        maxViews: maxViews.trim() ? Number(maxViews) : null,
        password,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setToast(result.message);
      setLabel("");
      setPassword("");
      setMaxViews("");
      await refreshLinks();
    });
  }

  function copy(token: string) {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 2000);
      })
      .catch(() => setToast("Could not copy the link. Copy it from the browser instead."));
  }

  function run(action: () => Promise<{ success: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setToast(result.message);
      await refreshLinks();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="h-fit rounded-2xl border border-white/8 bg-white/[0.025] p-5">
        <h2 className="text-base font-semibold text-white">Create a share link</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Anyone with the link can view or download the file while it stays active.
        </p>

        {fileOptions.length === 0 ? (
          <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-6 text-center">
            <p className="text-sm text-slate-400">Upload a file before creating a share link.</p>
            <Link className="mt-3 inline-block text-sm font-medium text-blue-300 hover:text-blue-200" href="/dashboard">
              Go to files
            </Link>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <label className="block text-xs font-medium text-slate-400" htmlFor="share-file">
              File
              <select
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-400/50"
                id="share-file"
                onChange={(event) => setFileId(event.target.value)}
                value={fileId}
              >
                {fileOptions.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.originalName} · {formatBytes(file.size)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-400" htmlFor="share-label">
              Label (optional)
              <input
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50"
                id="share-label"
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Client proposal"
                value={label}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-400" htmlFor="share-expiry">
                Expires
                <select
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-400/50"
                  id="share-expiry"
                  onChange={(event) => setExpiresInDays(event.target.value)}
                  value={expiresInDays}
                >
                  <option value="1">In 1 day</option>
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days</option>
                  <option value="0">Never</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-400" htmlFor="share-views">
                Max views
                <input
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50"
                  id="share-views"
                  min={1}
                  onChange={(event) => setMaxViews(event.target.value)}
                  placeholder="Unlimited"
                  type="number"
                  value={maxViews}
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-400" htmlFor="share-password">
              Password (optional)
              <input
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50"
                id="share-password"
                maxLength={128}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 4 characters"
                type="password"
                value={password}
              />
            </label>

            {error ? (
              <p aria-live="polite" className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2.5 text-sm text-rose-200" role="alert">
                {error}
              </p>
            ) : null}

            <button
              className="min-h-11 w-full rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50"
              disabled={busy || !fileId}
              type="submit"
            >
              {busy ? "Creating…" : "Create share link"}
            </button>
          </form>
        )}
      </section>

      <section className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Your share links</h2>
          <span className="text-xs text-slate-500">{links.length} total</span>
        </div>

        {links.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-300">No share links yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              Create a secure link to share a file without exposing your workspace.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {links.map((link) => {
              const shareUrl = `/share/${link.token}`;
              return (
                <li className="rounded-2xl border border-white/8 bg-white/[0.025] p-4" key={link.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="truncate text-sm font-medium text-slate-100 transition hover:text-blue-200" href={shareUrl}>
                          {link.label || link.fileName}
                        </Link>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyles[link.status]}`}>
                          {statusLabels[link.status]}
                        </span>
                        {link.passwordProtected ? (
                          <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] text-blue-200">
                            Password
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {link.fileName} · {formatBytes(link.fileSize)} · Created {formatDate(link.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {link.viewCount} views{link.maxViews ? ` of ${link.maxViews}` : ""}
                        {link.expiresAt ? ` · Expires ${formatDate(link.expiresAt)}` : " · Never expires"}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/5"
                        onClick={() => copy(link.token)}
                        type="button"
                      >
                        {copiedToken === link.token ? "Copied" : "Copy link"}
                      </button>
                      <Link className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/5" href={shareUrl}>
                        Open
                      </Link>
                      {link.status === "active" ? (
                        <button
                          className="rounded-lg border border-amber-400/20 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-400/10"
                          disabled={busy}
                          onClick={() => run(() => revokeShareLink({ id: link.id }))}
                          type="button"
                        >
                          Revoke
                        </button>
                      ) : null}
                      <button
                        className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-400/10"
                        disabled={busy}
                        onClick={() => run(() => deleteShareLink({ id: link.id }))}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {toast ? (
        <div aria-live="polite" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-2xl" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
