import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setShareAccess } from "@/lib/share/access";
import { getShareAvailability } from "@/lib/share/status";
import { applyRateLimit } from "@/lib/security/http";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const bodySchema = z.object({
  password: z.string().min(1, "Enter the share password.").max(128),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const limited = await applyRateLimit(request, "share:unlock", 15, 5 * 60_000);
  if (limited) return limited;

  const { token } = await context.params;
  if (!tokenSchema.safeParse(token).success) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter the share password." },
      { status: 400 },
    );
  }

  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: {
      id: true,
      passwordHash: true,
      revokedAt: true,
      expiresAt: true,
      maxViews: true,
      viewCount: true,
      file: { select: { deletedAt: true } },
    },
  });

  const availability = getShareAvailability(link);
  if (!link || !availability.valid) {
    return NextResponse.json(
      { error: "This share link is no longer available." },
      { status: 410 },
    );
  }

  if (!link.passwordHash) {
    await setShareAccess(token);
    return NextResponse.json({ success: true });
  }

  const matches = await compare(parsed.data.password, link.passwordHash);
  if (!matches) {
    return NextResponse.json(
      { error: "That password is incorrect." },
      { status: 401 },
    );
  }

  await setShareAccess(token);
  return NextResponse.json({ success: true });
}
