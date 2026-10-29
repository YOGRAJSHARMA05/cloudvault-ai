import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasShareAccess } from "@/lib/share/access";
import { getShareAvailability, shareUnavailableMessage } from "@/lib/share/status";
import { ShareUnlock } from "@/components/share/ShareUnlock";
import { SharedFileView } from "@/components/share/SharedFileView";

export const instant = false;

type SharePageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharePage({ params }: SharePageProps) {
  await connection();
  const { token } = await params;

  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: {
      token: true,
      label: true,
      passwordHash: true,
      expiresAt: true,
      revokedAt: true,
      maxViews: true,
      viewCount: true,
      file: {
        select: {
          originalName: true,
          extension: true,
          mimeType: true,
          size: true,
          deletedAt: true,
        },
      },
    },
  });

  const availability = getShareAvailability(link);
  if (!availability.valid || !link?.file) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-5 py-12 text-white">
        <section className="w-full max-w-md rounded-2xl border border-white/8 bg-white/[0.025] p-7 text-center shadow-2xl">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
            <svg aria-hidden="true" className="size-7" fill="none" viewBox="0 0 24 24">
              <path d="M12 8.5v4m0 3.5h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            </svg>
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Link unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {availability.valid ? shareUnavailableMessage("missing") : shareUnavailableMessage(availability.reason)}
          </p>
          <Link className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-medium text-slate-200 transition hover:bg-white/5" href="/">
            Go to CloudVault AI
          </Link>
        </section>
      </main>
    );
  }

  const unlocked = !link.passwordHash || (await hasShareAccess(token));
  if (!unlocked) {
    return <ShareUnlock fileName={link.file.originalName} token={link.token} />;
  }

  return (
    <SharedFileView
      expiresAt={link.expiresAt?.toISOString() ?? null}
      extension={link.file.extension}
      fileName={link.file.originalName}
      label={link.label}
      maxViews={link.maxViews}
      mimeType={link.file.mimeType}
      size={link.file.size.toString()}
      token={link.token}
      viewCount={link.viewCount}
    />
  );
}
