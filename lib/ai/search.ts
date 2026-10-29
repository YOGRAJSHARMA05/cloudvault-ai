import "server-only";

import {
  cosineSimilarity,
  createQueryEmbeddingVariants,
  ensureEmbeddingsForUser,
  parseEmbedding,
  pickQueryVector,
  tokenizeForEmbedding,
} from "@/lib/ai/embeddings";
import { prisma } from "@/lib/prisma";

export type SemanticMatch = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: string;
  folder: string;
  folderName: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  score: number;
};

function lexicalScore(queryTokens: string[], fileName: string): number {
  if (!queryTokens.length) return 0;
  const normalized = fileName.toLowerCase();
  let matches = 0;
  for (const token of queryTokens) {
    if (normalized.includes(token)) matches += 1;
  }
  return matches / queryTokens.length;
}

export async function findSemanticMatches(
  userId: string,
  query: string,
  limit = 30,
  existingVariants?: Map<string, number[]>,
): Promise<{ matches: SemanticMatch[]; indexed: number; scanned: number }> {
  const queryVariants =
    existingVariants ?? (await createQueryEmbeddingVariants(query));
  const queryTokens = tokenizeForEmbedding(query);

  // Lazily index a few older files so semantic search keeps improving after
  // deployment without blocking uploads.
  await ensureEmbeddingsForUser(userId, 3).catch(() => 0);

  const files = await prisma.file.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      extension: true,
      size: true,
      folder: true,
      isFavorite: true,
      createdAt: true,
      updatedAt: true,
      parentFolder: { select: { name: true } },
      embedding: { select: { vector: true, model: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1_000,
  });

  let indexed = 0;
  const scored = files.map((file) => {
    const vector = file.embedding ? parseEmbedding(file.embedding.vector) : [];
    if (vector.length) indexed += 1;
    const queryVector = file.embedding
      ? pickQueryVector(queryVariants, file.embedding.model)
      : undefined;
    const similarity = vector.length && queryVector
      ? cosineSimilarity(queryVector, vector)
      : 0;
    const direct = lexicalScore(queryTokens, file.originalName);
    const score = similarity * 0.85 + direct * 0.15;
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      extension: file.extension,
      size: file.size.toString(),
      folder: file.folder,
      folderName: file.parentFolder?.name ?? file.folder ?? "/",
      isFavorite: file.isFavorite,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      score: Number(score.toFixed(4)),
    };
  });

  const matches = scored
    .filter((file) => file.score > 0.02)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return { matches, indexed, scanned: files.length };
}
