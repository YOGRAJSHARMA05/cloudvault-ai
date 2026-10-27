import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readUserFile } from "@/lib/file-storage";

const fileIdSchema = z.string().cuid();

export async function GET(
  request: Request,
  context: RouteContext<"/files/[fileId]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { fileId } = await context.params;
  if (!fileIdSchema.safeParse(fileId).success) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const file = await prisma.file.findFirst({
    where: { id: fileId, userId: session.user.id },
    select: { storedName: true, originalName: true, mimeType: true, size: true },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const inline = searchParams.get("inline") === "true";

  try {
    const contents = await readUserFile(session.user.id, file.storedName);
    const disposition = inline
      ? `inline; filename="${encodeURIComponent(file.originalName)}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
      : `attachment; filename="${encodeURIComponent(file.originalName)}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`;
    return new Response(new Uint8Array(contents), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": file.size.toString(),
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "The stored file is unavailable." }, { status: 404 });
  }
}