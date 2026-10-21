export default function DashboardLoading() {
  return (
    <main aria-label="Loading file workspace" className="min-h-screen bg-[#080d18] px-5 py-8 text-white sm:px-8" role="status">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex items-center justify-between border-b border-white/7 pb-6">
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-white/8" />
            <div className="h-8 w-44 animate-pulse rounded bg-white/8" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-xl bg-white/8" />
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="h-28 animate-pulse rounded-2xl border border-white/8 bg-white/[0.025]" key={index} />
          ))}
        </div>
        <div className="mt-8 h-24 animate-pulse rounded-2xl border border-white/8 bg-white/[0.025]" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="h-16 animate-pulse rounded-xl border border-white/8 bg-white/[0.025]" key={index} />
          ))}
        </div>
        <span className="sr-only">Loading your folders and files…</span>
      </div>
    </main>
  );
}