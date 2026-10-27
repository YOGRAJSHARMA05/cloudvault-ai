import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { computeStats, detectLanguage } from "@/lib/ai/analysis";

const schema = z.object({ fileId: z.string().cuid() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { fileId } = parsed.data;
    const cached = await prisma.documentMetadata.findFirst({
      where: { fileId, userId: session.user.id },
    });
    if (cached) {
      return NextResponse.json({ cached: true, metadata: cached });
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, userId: session.user.id },
      select: { originalName: true, mimeType: true, extension: true, size: true, createdAt: true },
    });
    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const extracted = await extractDocumentText(session.user.id, fileId);
    const text = extracted?.text || "";
    const stats = computeStats(text);
    const language = detectLanguage(text);
    const pageCount = file.extension.toLowerCase() === "pdf" ? Math.max(1, Math.ceil(stats.wordCount / 250)) : undefined;

    const metadata = await prisma.documentMetadata.upsert({
      where: { fileId },
      create: {
        fileId,
        userId: session.user.id,
        title: file.originalName.replace(/\.[^.]+$/, ""),
        pageCount: pageCount || null,
        wordCount: stats.wordCount,
        characterCount: stats.characterCount,
        readingTimeMinutes: stats.readingTimeMinutes,
        language,
        headingsCount: stats.headingsCount,
        paragraphsCount: stats.paragraphsCount,
        fileSize: file.size.toString(),
        fileType: file.mimeType,
      },
      update: {
        title: file.originalName.replace(/\.[^.]+$/, ""),
        pageCount: pageCount || null,
        wordCount: stats.wordCount,
        characterCount: stats.characterCount,
        readingTimeMinutes: stats.readingTimeMinutes,
        language,
        headingsCount: stats.headingsCount,
        paragraphsCount: stats.paragraphsCount,
        fileSize: file.size.toString(),
        fileType: file.mimeType,
      },
    });

    return NextResponse.json({ cached: false, metadata });
  } catch {
    return NextResponse.json({ error: "Failed to extract metadata." }, { status: 500 });
  }
}
