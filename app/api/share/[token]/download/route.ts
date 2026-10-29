import { NextResponse } from "next/server";
import { z } from "zod";
import { readUserFile } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";
import { hasShareAccess } from "@/lib/share/access";
import { getShareAvailability } from "@/lib/share/status";
import { applyRateLimit } from "@/lib/security/http";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:share:[token]:download");

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

function contentDisposition(fileName: string, inline: boolean): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const limited = await applyRateLimit(request, "share:download", 120);
  if (limited) return limited;

  const { token } = await context.params;
  if (!tokenSchema.safeParse(token).success) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }

  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      passwordHash: true,
      revokedAt: true,
      expiresAt: true,
      maxViews: true,
      viewCount: true,
      file: {
        select: {
          storedName: true,
          originalName: true,
          mimeType: true,
          deletedAt: true,
        },
      },
    },
  });

  const availability = getShareAvailability(link);
  if (!availability.valid || !link?.file) {
    return NextResponse.json(
      { error: "This share link is no longer available." },
      { status: 410 },
    );
  }

  if (link.passwordHash && !(await hasShareAccess(token))) {
    return NextResponse.json(
      { error: "Enter the share password to continue." },
      { status: 401 },
    );
  }

  try {
    const data = await readUserFile(link.userId, link.file.storedName);
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get("inline") === "true";

    await prisma.shareLink
      .update({ where: { id: link.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": link.file.mimeType || "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Content-Disposition": contentDisposition(link.file.originalName, inline),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log.error("Failed to serve shared file", error);
    return NextResponse.json(
      { error: "The shared file could not be read." },
      { status: 500 },
    );
  }
}
