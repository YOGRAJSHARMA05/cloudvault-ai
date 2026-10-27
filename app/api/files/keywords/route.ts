import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { extractKeywords } from "@/lib/ai/analysis";

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
    const extracted = await extractDocumentText(session.user.id, fileId);
    if (!extracted || !extracted.text.trim()) {
      return NextResponse.json({ error: "Unable to extract text from this document." }, { status: 422 });
    }

    const keywords = extractKeywords(extracted.text, 15);
    return NextResponse.json({ keywords });
  } catch {
    return NextResponse.json({ error: "Failed to generate keywords." }, { status: 500 });
  }
}
