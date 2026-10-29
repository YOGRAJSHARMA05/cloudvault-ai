"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { ensureEmbeddingsForUser } from "@/lib/ai/embeddings";
import { findSemanticMatches } from "@/lib/ai/search";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import type { SemanticSearchResult } from "@/types/search";

import { createLogger } from "@/lib/logger";

const log = createLogger("actions:search");

const semanticSearchSchema = z.object({
  query: z.string().trim().min(2, "Enter at least two characters.").max(120),
});

export async function semanticSearchWorkspace(
  input: unknown,
): Promise<SemanticSearchResult> {
  const user = await requireUser();
  const parsed = semanticSearchSchema.safeParse(input);
  if (!parsed.success) return { matches: [], indexed: 0, scanned: 0 };

  const { query } = parsed.data;
  const result = await findSemanticMatches(user.id, query);

  after(async () => {
    await prisma.searchEvent
      .create({
        data: {
          userId: user.id,
          query,
          resultCount: result.matches.length,
          source: "semantic",
        },
      })
      .catch((error: unknown) => {
        log.error("Failed to record a semantic search event", error);
      });
  });

  return result;
}

export async function indexWorkspaceFiles(): Promise<{
  success: boolean;
  message: string;
  indexed: number;
}> {
  const user = await requireUser();
  const indexed = await ensureEmbeddingsForUser(user.id, 20);
  revalidatePath("/search");
  return {
    success: true,
    message:
      indexed > 0
        ? `${indexed} ${indexed === 1 ? "file" : "files"} indexed for semantic search.`
        : "All files are already indexed.",
    indexed,
  };
}
