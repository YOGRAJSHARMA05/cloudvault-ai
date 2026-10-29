export function PreviewSkeleton({ label = "Loading preview..." }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[400px] w-full items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" />
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export function PreviewError({
  message,
  href,
}: {
  message: string;
  href?: string;
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] px-6 text-center">
      <p className="text-sm font-medium text-rose-200">{message}</p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Please try again or download the file to view it locally.
      </p>
      {href ? (
        <a className="mt-5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400" href={href}>
          Download file
        </a>
      ) : null}
    </div>
  );
}
