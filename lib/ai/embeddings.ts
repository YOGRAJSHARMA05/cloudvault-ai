import "server-only";

import { Prisma } from "@prisma/client";
import {
  getEmbeddingTarget,
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL,
  type AiProviderName,
} from "@/lib/ai/config";
import { embedWithProvider } from "@/lib/ai/provider";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { prisma } from "@/lib/prisma";

import { createLogger } from "@/lib/logger";

const log = createLogger("ai:embeddings");

// Local fallback constants kept for backwards compatibility.
export const EMBEDDING_DIMENSIONS = LOCAL_EMBEDDING_DIMENSIONS;
export const EMBEDDING_MODEL = LOCAL_EMBEDDING_MODEL;

export type StoredEmbedding = {
  vector: number[];
  model: string;
  dimensions: number;
  provider: AiProviderName;
};

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const stopWords = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "where",
  "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
  "very", "can", "will", "just", "should", "now", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "get", "got",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "up", "about",
  "into", "through", "during", "before", "after", "above", "below", "between",
  "under", "again", "further", "once", "here", "there", "this", "that", "these",
  "those", "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
  "she", "her", "it", "its", "they", "them", "their",
]);

function hashToken(token: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % LOCAL_EMBEDDING_DIMENSIONS;
}

export function tokenizeForEmbedding(text: string): string[] {
  const matches = text
    .toLowerCase()
    .normalize("NFKC")
    .match(/[\p{L}\p{N}][\p{L}\p{N}+#._-]*/gu);
  if (!matches) return [];

  const tokens: string[] = [];
  for (const token of matches) {
    if (token.length < 3 || token.length > 64) continue;
    if (stopWords.has(token)) continue;
    tokens.push(token);
    if (tokens.length >= 20_000) break;
  }
  return tokens;
}

export function createEmbedding(text: string): number[] {
  const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
  const tokens = tokenizeForEmbedding(text);
  if (!tokens.length) return vector;

  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  for (const [token, frequency] of frequencies) {
    const weight = 1 + Math.log(frequency);
    vector[hashToken(token)] += weight;
    for (const part of token.split(/[._-]+/)) {
      if (part.length >= 3) vector[hashToken(part)] += weight * 0.35;
    }
  }

  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude);
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

/**
 * Creates a document/query embedding using the configured provider, falling
 * back to the deterministic local hashed TF-IDF vector when no provider key is
 * configured or the provider call fails.
 */
export async function createStoredEmbedding(
  text: string,
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT",
): Promise<StoredEmbedding> {
  const target = getEmbeddingTarget();
  if (target.provider !== "local") {
    const result = await embedWithProvider([text], taskType);
    const vector = result?.vectors[0];
    if (result && vector && vector.length) {
      return {
        vector,
        model: result.model,
        dimensions: vector.length,
        provider: result.provider,
      };
    }
  }
  return {
    vector: createEmbedding(text),
    model: LOCAL_EMBEDDING_MODEL,
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    provider: "local",
  };
}

/**
 * Batch version used while indexing document chunks. Provider batching keeps
 * indexing fast; the fallback embeds every chunk locally.
 */
export async function createStoredEmbeddings(
  texts: string[],
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT",
): Promise<StoredEmbedding[]> {
  if (!texts.length) return [];
  const target = getEmbeddingTarget();
  if (target.provider !== "local") {
    const result = await embedWithProvider(texts, taskType);
    if (result && result.vectors.length === texts.length) {
      return result.vectors.map((vector) => ({
        vector,
        model: result.model,
        dimensions: vector.length,
        provider: result.provider,
      }));
    }
  }
  return texts.map((text) => ({
    vector: createEmbedding(text),
    model: LOCAL_EMBEDDING_MODEL,
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    provider: "local" as const,
  }));
}

/**
 * Query embeddings for every model that can be present in storage. Vectors are
 * only compared when the stored model matches, so a workspace that mixes local
 * and provider embeddings keeps working during a gradual re-index.
 */
export async function createQueryEmbeddingVariants(
  text: string,
): Promise<Map<string, number[]>> {
  const variants = new Map<string, number[]>();
  variants.set(LOCAL_EMBEDDING_MODEL, createEmbedding(text));

  const target = getEmbeddingTarget();
  if (target.provider !== "local") {
    const result = await embedWithProvider([text], "RETRIEVAL_QUERY");
    const vector = result?.vectors[0];
    if (result && vector && vector.length) {
      variants.set(result.model, vector);
    }
  }
  return variants;
}

export function pickQueryVector(
  variants: Map<string, number[]>,
  model: string,
): number[] | undefined {
  return variants.get(model) ?? variants.get(LOCAL_EMBEDDING_MODEL);
}

export function parseEmbedding(value: Prisma.JsonValue): number[] {
  if (!Array.isArray(value)) return [];
  const vector: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) return [];
    vector.push(entry);
  }
  return vector;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += left[index] * right[index];
  }
  return Math.max(0, Math.min(1, score));
}

export async function buildFileEmbedding(
  userId: string,
  fileId: string,
): Promise<boolean> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId, deletedAt: null },
    select: { id: true, originalName: true, extension: true, mimeType: true },
  });
  if (!file) return false;

  const extracted = await extractDocumentText(userId, fileId);
  const source = [
    file.originalName,
    file.extension,
    file.mimeType,
    extracted?.text ?? "",
  ].join("\n");
  const embedding = await createStoredEmbedding(source, "RETRIEVAL_DOCUMENT");

  try {
    await prisma.fileEmbedding.upsert({
      where: { fileId },
      create: {
        fileId,
        userId,
        vector: embedding.vector,
        dimensions: embedding.dimensions,
        model: embedding.model,
      },
      update: {
        vector: embedding.vector,
        dimensions: embedding.dimensions,
        model: embedding.model,
      },
    });
    return true;
  } catch (error) {
    log.error("Failed to store file embedding", error);
    return false;
  }
}

export async function ensureEmbeddingsForUser(
  userId: string,
  limit = 8,
): Promise<number> {
  if (limit <= 0) return 0;
  const target = getEmbeddingTarget();
  const files = await prisma.file.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { embedding: { is: null } },
        { embedding: { is: { model: { not: target.model } } } },
      ],
    },
    select: { id: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  let indexed = 0;
  for (const file of files) {
    if (await buildFileEmbedding(userId, file.id)) indexed += 1;
  }
  return indexed;
}
