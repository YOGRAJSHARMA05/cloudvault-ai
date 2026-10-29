import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAiUsageSummary } from "@/lib/ai/usage";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:ai:usage");

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    return NextResponse.json(await getAiUsageSummary(session.user.id));
  } catch (error) {
    log.error("Failed to load AI usage", error);
    return NextResponse.json({ error: "Could not load AI usage." }, { status: 500 });
  }
}
