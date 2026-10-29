import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findSimilarDocuments } from "@/lib/ai/rag";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/security/http";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:files:[fileId]:similar");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = await applyRateLimit(
    request,
    `ai:similar:${session.user.id}`,
    40,
  );
  if (limited) return limited;

  const { fileId } = await params;
  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(Math.floor(limitParam), 12))
    : 6;

  try {
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const similar = await findSimilarDocuments(session.user.id, fileId, limit);
    return NextResponse.json({ similar });
  } catch (error) {
    log.error("Failed to find similar documents", error);
    return NextResponse.json(
      { error: "Could not find similar documents." },
      { status: 500 },
    );
  }
}
