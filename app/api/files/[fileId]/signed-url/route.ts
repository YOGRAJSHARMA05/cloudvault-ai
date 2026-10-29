import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createUserFileSignedUrl } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/security/http";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:files:[fileId]:signed-url");

const fileIdSchema = z.string().cuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = await applyRateLimit(request, `files:signed-url:${session.user.id}`, 60);
  if (limited) return limited;

  const { fileId } = await context.params;
  if (!fileIdSchema.safeParse(fileId).success) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const file = await prisma.file.findFirst({
    where: { id: fileId, userId: session.user.id, deletedAt: null },
    select: { id: true, storedName: true },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  try {
    const signedUrl = await createUserFileSignedUrl(
      session.user.id,
      file.storedName,
      300,
    );
    return NextResponse.json({
      url: signedUrl ?? `/files/${file.id}`,
      provider: signedUrl ? "supabase" : "local",
      expiresIn: signedUrl ? 300 : null,
    });
  } catch (error) {
    log.error("Failed to create signed URL", error);
    return NextResponse.json(
      { error: "Could not create a secure download URL." },
      { status: 500 },
    );
  }
}
