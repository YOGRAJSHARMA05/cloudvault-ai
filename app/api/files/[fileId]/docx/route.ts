import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { readUserFile } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/security/http";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:files:[fileId]:docx");

const fileIdSchema = z.string().cuid();
const MAX_DOCX_CHARACTERS = 250_000;

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = await applyRateLimit(request, `files:docx:${session.user.id}`, 30);
  if (limited) return limited;

  const { fileId } = await context.params;
  if (!fileIdSchema.safeParse(fileId).success) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const file = await prisma.file.findFirst({
    where: { id: fileId, userId: session.user.id, deletedAt: null },
    select: { storedName: true, extension: true },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  if (file.extension.toLowerCase() !== "docx") {
    return NextResponse.json(
      { error: "Only DOCX files can be converted." },
      { status: 415 },
    );
  }

  try {
    const buffer = await readUserFile(session.user.id, file.storedName);
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value || "").slice(0, MAX_DOCX_CHARACTERS);
    return NextResponse.json({ text });
  } catch (error) {
    log.error("Failed to convert DOCX", error);
    return NextResponse.json(
      { error: "Could not read this document." },
      { status: 500 },
    );
  }
}
