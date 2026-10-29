import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { estimateTokens } from "@/lib/ai/prompt";
import { generateSmartKeywords } from "@/lib/ai/summarize";
import { beginAiRequest, finishAiRequest } from "@/lib/ai/usage";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/security/http";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:files:keywords");

const schema = z.object({ fileId: z.string().cuid() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = await applyRateLimit(request, `ai:keywords:${session.user.id}`, 30);
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { fileId } = parsed.data;
    const owned = await prisma.file.findFirst({
      where: { id: fileId, userId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const extracted = await extractDocumentText(session.user.id, fileId);
    if (!extracted || !extracted.text.trim()) {
      return NextResponse.json(
        { error: "Unable to extract text from this document." },
        { status: 422 },
      );
    }

    const started = await beginAiRequest(session.user.id, "keywords");
    if (!started.allowed) {
      return NextResponse.json(
        {
          error: "Daily AI limit reached. It resets at midnight UTC.",
          code: "limit_reached",
          usage: started.usage,
        },
        { status: 429 },
      );
    }

    const generated = await generateSmartKeywords(
      extracted.text,
      extracted.originalName,
    );

    await finishAiRequest(started.recordId, {
      inputTokens: estimateTokens(extracted.text.slice(0, 12_000)),
      outputTokens: estimateTokens(generated.keywords.join(", ")),
    });

    return NextResponse.json({
      keywords: generated.keywords,
      provider: generated.provider,
      model: generated.model,
      usage: started.usage,
    });
  } catch (error) {
    log.error("Failed to generate keywords", error);
    return NextResponse.json({ error: "Failed to generate keywords." }, { status: 500 });
  }
}
