import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { findSemanticMatches } from "@/lib/ai/search";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/security/http";

const schema = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(50).optional().default(30),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = await applyRateLimit(
    request,
    `ai:semantic-search:${session.user.id}`,
    30,
  );
  if (limited) return limited;

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const result = await findSemanticMatches(
      session.user.id,
      parsed.data.query,
      parsed.data.limit,
    );
    await prisma.searchEvent
      .create({
        data: {
          userId: session.user.id,
          query: parsed.data.query,
          resultCount: result.matches.length,
          source: "semantic-api",
        },
      })
      .catch(() => undefined);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Semantic search failed." },
      { status: 500 },
    );
  }
}
