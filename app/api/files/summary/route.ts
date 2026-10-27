import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { generateSummary } from "@/lib/ai/analysis";

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
    const cached = await prisma.documentSummary.findFirst({
      where: { fileId, userId: session.user.id },
    });
    if (cached) {
      return NextResponse.json({
        cached: true,
        executiveSummary: cached.executiveSummary,
        keyPoints: cached.keyPoints,
        importantTechnologies: cached.importantTechnologies,
        importantDates: cached.importantDates,
        actionItems: cached.actionItems,
      });
    }

    const extracted = await extractDocumentText(session.user.id, fileId);
    if (!extracted || !extracted.text.trim()) {
      return NextResponse.json({ error: "Unable to extract text from this document." }, { status: 422 });
    }

    const summary = generateSummary(extracted.text);
    await prisma.documentSummary.upsert({
      where: { fileId },
      create: {
        fileId,
        userId: session.user.id,
        executiveSummary: summary.executiveSummary,
        keyPoints: summary.keyPoints as any,
        importantTechnologies: summary.importantTechnologies as any,
        importantDates: summary.importantDates as any,
        actionItems: summary.actionItems as any,
      },
      update: {
        executiveSummary: summary.executiveSummary,
        keyPoints: summary.keyPoints as any,
        importantTechnologies: summary.importantTechnologies as any,
        importantDates: summary.importantDates as any,
        actionItems: summary.actionItems as any,
      },
    });

    return NextResponse.json({ cached: false, ...summary });
  } catch {
    return NextResponse.json({ error: "Failed to generate summary." }, { status: 500 });
  }
}
