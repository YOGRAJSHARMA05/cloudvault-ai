import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isProviderConfigured } from "@/lib/ai/config";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { estimateTokens } from "@/lib/ai/prompt";
import { summarizeDocument } from "@/lib/ai/summarize";
import { beginAiRequest, finishAiRequest } from "@/lib/ai/usage";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/security/http";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:files:summary");

const schema = z.object({ fileId: z.string().cuid() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = await applyRateLimit(request, `ai:summary:${session.user.id}`, 20);
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { fileId } = parsed.data;
    const cached = await prisma.documentSummary.findFirst({
      where: { fileId, userId: session.user.id },
    });
    if (cached && (cached.provider !== "local" || !isProviderConfigured())) {
      return NextResponse.json({
        cached: true,
        executiveSummary: cached.executiveSummary,
        keyPoints: cached.keyPoints,
        importantTechnologies: cached.importantTechnologies,
        importantDates: cached.importantDates,
        actionItems: cached.actionItems,
        provider: cached.provider,
        model: cached.model,
      });
    }

    const owned = await prisma.file.findFirst({
      where: { id: fileId, userId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const started = await beginAiRequest(session.user.id, "summary");
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

    const extracted = await extractDocumentText(session.user.id, fileId);
    const text = extracted?.text?.trim() || "";
    const generated = await summarizeDocument(
      text,
      extracted?.originalName ?? "document",
    );
    const summary = generated.summary;

    try {
      await prisma.documentSummary.upsert({
        where: { fileId },
        create: {
          fileId,
          userId: session.user.id,
          executiveSummary: summary.executiveSummary,
          keyPoints: summary.keyPoints,
          importantTechnologies: summary.importantTechnologies,
          importantDates: summary.importantDates,
          actionItems: summary.actionItems,
          provider: generated.provider,
          model: generated.model,
        },
        update: {
          executiveSummary: summary.executiveSummary,
          keyPoints: summary.keyPoints,
          importantTechnologies: summary.importantTechnologies,
          importantDates: summary.importantDates,
          actionItems: summary.actionItems,
          provider: generated.provider,
          model: generated.model,
        },
      });
    } catch (error) {
      log.error("Failed to cache document summary", error);
    }

    await finishAiRequest(started.recordId, {
      inputTokens: estimateTokens(text.slice(0, 16_000)),
      outputTokens: estimateTokens(JSON.stringify(summary)),
    });

    return NextResponse.json({
      cached: false,
      ...summary,
      provider: generated.provider,
      model: generated.model,
      usage: started.usage,
    });
  } catch (error) {
    log.error("Failed to generate summary", error);
    return NextResponse.json({ error: "Failed to generate summary." }, { status: 500 });
  }
}
