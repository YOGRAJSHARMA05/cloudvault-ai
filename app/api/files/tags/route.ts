import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { FileTagError, generateFileTags, getFileTags } from "@/lib/ai/tags";
import { beginAiRequest, finishAiRequest } from "@/lib/ai/usage";
import { applyRateLimit } from "@/lib/security/http";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:files:tags");

const postSchema = z.object({
  fileId: z.string().cuid(),
  refresh: z.boolean().optional().default(false),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const fileId = new URL(request.url).searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id." }, { status: 400 });
  }

  try {
    const tags = await getFileTags(session.user.id, fileId);
    return NextResponse.json({ tags });
  } catch (error) {
    log.error("Failed to load file tags", error);
    return NextResponse.json({ error: "Could not load tags." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = await applyRateLimit(request, `ai:tags:${session.user.id}`, 20);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const started = await beginAiRequest(session.user.id, "tags");
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

  try {
    const result = await generateFileTags(session.user.id, parsed.data.fileId, {
      refresh: true,
    });
    await finishAiRequest(started.recordId, null);
    return NextResponse.json({ ...result, usage: started.usage });
  } catch (error) {
    if (error instanceof FileTagError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "not_found" ? 404 : 500 },
      );
    }
    log.error("Failed to generate file tags", error);
    return NextResponse.json({ error: "Failed to generate tags." }, { status: 500 });
  }
}
