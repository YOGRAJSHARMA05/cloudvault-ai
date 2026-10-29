import Link from "next/link";
import { getDashboardAnalytics } from "@/app/actions/analytics";
import { requireUser } from "@/lib/auth-guard";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import type { AnalyticsBucket } from "@/types/analytics";

export const instant = false;

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

function maxBytes(buckets: AnalyticsBucket[]): number {
  return Math.max(1, ...buckets.map((bucket) => Number(bucket.bytes)));
}

export default async function AnalyticsPage() {
  await requireUser();
  const analytics = await getDashboardAnalytics();
  const categoryMax = maxBytes(analytics.storage.byCategory);
  const monthlyMax = Math.max(1, ...analytics.storage.monthly.map((point) => Number(point.bytes)));
  const fileTypeMax = maxBytes(analytics.fileTypes);
  const totalFiles = analytics.storage.byCategory.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <WorkspaceShell
      description="Understand how your storage is used, what you upload most, and how AI search is being used."
      title="Analytics"
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Storage used" value={formatBytes(analytics.storage.totalBytes)} detail="across active files" />
          <MetricCard label="Files" value={totalFiles.toLocaleString()} detail="available in your workspace" />
          <MetricCard label="Folders" value={analytics.folderStats.total.toLocaleString()} detail={`${analytics.folderStats.root} at the root · ${analytics.folderStats.trashed} in trash`} />
          <MetricCard label="Searches" value={analytics.searchStats.total.toLocaleString()} detail={`${analytics.searchStats.last30Days} in the last 30 days`} />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
            <h2 className="text-base font-semibold text-white">Storage by category</h2>
            <div className="mt-5 space-y-4">
              {analytics.storage.byCategory.map((bucket) => (
                <div key={bucket.label}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-300">{bucket.label}</span>
                    <span className="text-slate-500">{formatBytes(bucket.bytes)} · {bucket.count} files</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-blue-400/70"
                      style={{ width: `${Math.max(2, (Number(bucket.bytes) / categoryMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
            <h2 className="text-base font-semibold text-white">Uploads over time</h2>
            <p className="mt-1 text-xs text-slate-500">Storage added per month for the last six months.</p>
            <div className="mt-6 flex h-44 items-end gap-3">
              {analytics.storage.monthly.map((point) => (
                <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={point.month}>
                  <span className="text-[10px] text-slate-500">{formatBytes(point.bytes)}</span>
                  <div className="flex h-28 w-full items-end rounded-lg bg-white/[0.03]">
                    <div
                      className="w-full rounded-lg bg-gradient-to-t from-blue-500/60 to-blue-300/80"
                      style={{ height: `${Math.max(3, (Number(point.bytes) / monthlyMax) * 100)}%` }}
                      title={`${point.label}: ${formatBytes(point.bytes)} across ${point.count} files`}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400">{point.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
            <h2 className="text-base font-semibold text-white">File types</h2>
            {analytics.fileTypes.length ? (
              <ul className="mt-5 space-y-3">
                {analytics.fileTypes.map((bucket) => (
                  <li key={bucket.label}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-200">{bucket.label}</span>
                      <span className="text-slate-500">{bucket.count} files · {formatBytes(bucket.bytes)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-violet-400/70"
                        style={{ width: `${Math.max(2, (Number(bucket.bytes) / fileTypeMax) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-slate-500">Upload files to see your type breakdown.</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
            <h2 className="text-base font-semibold text-white">Top searches</h2>
            <p className="mt-1 text-xs text-slate-500">Semantic and workspace searches from the last 30 days.</p>
            {analytics.searchStats.topQueries.length ? (
              <ul className="mt-5 space-y-2">
                {analytics.searchStats.topQueries.map((item) => (
                  <li className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-sm" key={item.query}>
                    <span className="min-w-0 truncate text-slate-200">{item.query}</span>
                    <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">{item.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-slate-500">Search activity will appear here after you use AI search.</p>
            )}
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
            <h2 className="text-base font-semibold text-white">Recent uploads</h2>
            {analytics.recentUploads.length ? (
              <ul className="mt-4 divide-y divide-white/5">
                {analytics.recentUploads.map((file) => (
                  <li className="flex items-center justify-between gap-3 py-3" key={file.id}>
                    <div className="min-w-0">
                      <Link className="truncate text-sm text-slate-200 transition hover:text-blue-200" href={`/files/${file.id}/preview`}>
                        {file.originalName}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">{file.extension.toUpperCase()} · {formatBytes(file.size)} · {formatDate(file.createdAt)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-600">{file.extension}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-slate-500">No uploads yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
            <h2 className="text-base font-semibold text-white">Latest AI summaries</h2>
            {analytics.recentSummaries.length ? (
              <ul className="mt-4 space-y-3">
                {analytics.recentSummaries.map((summary) => (
                  <li className="rounded-xl border border-white/8 bg-white/[0.02] p-3" key={summary.fileId}>
                    <Link className="truncate text-sm font-medium text-slate-200 transition hover:text-blue-200" href={`/files/${summary.fileId}/preview`}>
                      {summary.fileName}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{summary.executiveSummary}</p>
                    <p className="mt-1.5 text-[11px] text-slate-600">Updated {formatDate(summary.updatedAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-slate-500">Summaries are generated automatically after upload.</p>
            )}
          </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
