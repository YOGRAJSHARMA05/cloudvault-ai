import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { extractDocumentText } from "@/lib/ai/extract-text";

const schema = z.object({ fileId: z.string().cuid(), query: z.string().min(1).max(100) });

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

    const { fileId, query } = parsed.data;
    const extracted = await extractDocumentText(session.user.id, fileId);
    if (!extracted || !extracted.text.trim()) {
      return NextResponse.json({ error: "Unable to extract text from this document." }, { status: 422 });
    }

    const text = extracted.text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matches: { index: number; snippet: string }[] = [];
    let count = 0;
    let pos = lowerText.indexOf(lowerQuery);
    while (pos !== -1) {
      count++;
      const start = Math.max(0, pos - 40);
      const end = Math.min(text.length, pos + query.length + 60);
      matches.push({ index: pos, snippet: text.slice(start, end) });
      pos = lowerText.indexOf(lowerQuery, pos + 1);
      if (matches.length >= 50) break;
    }

    return NextResponse.json({ count, matches });
  } catch {
    return NextResponse.json({ error: "Failed to search in document." }, { status: 500 });
  }
}
