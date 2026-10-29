import "server-only";

import { splitIntoChunks } from "@/lib/ai/chunking";
import {
  buildFileEmbedding,
  cosineSimilarity,
  createQueryEmbeddingVariants,
  createStoredEmbeddings,
  parseEmbedding,
  pickQueryVector,
  tokenizeForEmbedding,
} from "@/lib/ai/embeddings";
import { extractDocumentText } from "@/lib/ai/extract-text";
import type { RetrievalSource } from "@/lib/ai/prompt";
import { prisma } from "@/lib/prisma";
import type { SimilarDocumentView } from "@/types/ai";

import { createLogger } from "@/lib/logger";

const log = createLogger("ai:rag");

const CHUNK_MAX_CHARS = 1_200;
const MAX_CHUNKS = 120;
const MAX_CONTEXT_FILES = 4;
const MAX_DOCUMENT_CHUNKS = 800;

type DocumentText = {
  text: string;
  fileName: string;
  extension: string;
};

/**
 * Indexes chunk-level embeddings for a document. Existing chunks are treated
 * as immutable because uploaded files cannot change in place.
 */
export async function indexDocumentChunks(
  userId: string,
  fileId: string,
  document: DocumentText,
): Promise<boolean> {
  if (!document.text.trim()) return false;

  const existing = await prisma.documentChunk.count({
    where: { fileId, userId },
  });
  if (existing > 0) return true;

  const drafts = splitIntoChunks(document.text, {
    maxChars: CHUNK_MAX_CHARS,
    maxChunks: MAX_CHUNKS,
  });
  if (!drafts.length) return false;

  const embeddings = await createStoredEmbeddings(
    drafts.map(
      (draft) =>
        `${document.fileName}\n${draft.section}\n${draft.content}`,
    ),
    "RETRIEVAL_DOCUMENT",
  );

  try {
    await prisma.$transaction([
      prisma.documentChunk.deleteMany({ where: { fileId, userId } }),
      prisma.documentChunk.createMany({
        data: drafts.map((draft) => {
          const embedding = embeddings[draft.index];
          return {
            fileId,
            userId,
            chunkIndex: draft.index,
            section: draft.section,
            content: draft.content,
            charStart: draft.charStart,
            charEnd: draft.charEnd,
            vector: embedding.vector,
            dimensions: embedding.dimensions,
            model: embedding.model,
          };
        }),
      }),
    ]);
    return true;
  } catch (error) {
    log.error("Failed to index document chunks", error);
    return false;
  }
}

export async function ensureDocumentChunks(
  userId: string,
  fileId: string,
): Promise<boolean> {
  const existing = await prisma.documentChunk.count({
    where: { fileId, userId },
  });
  if (existing > 0) return true;

  const extracted = await extractDocumentText(userId, fileId);
  if (!extracted) return false;
  return indexDocumentChunks(userId, fileId, {
    text: extracted.text,
    fileName: extracted.originalName,
    extension: extracted.extension,
  });
}

function lexicalScore(tokens: string[], content: string): number {
  if (!tokens.length) return 0;
  const lower = content.toLowerCase();
  let matches = 0;
  for (const token of tokens) {
    if (lower.includes(token)) matches += 1;
  }
  return matches / tokens.length;
}

async function candidateFiles(
  userId: string,
  fileId: string | undefined,
): Promise<Array<{ id: string; originalName: string; extension: string }>> {
  if (fileId) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId, deletedAt: null },
      select: { id: true, originalName: true, extension: true },
    });
    if (!file) return [];
    await ensureDocumentChunks(userId, file.id).catch(() => false);
    return [file];
  }

  // Gradually index a couple of unindexed files per chat request so the
  // workspace becomes searchable without a blocking bulk job.
  const unindexed = await prisma.file.findMany({
    where: {
      userId,
      deletedAt: null,
      chunks: { none: {} },
    },
    select: { id: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2,
  });
  for (const file of unindexed) {
    await ensureDocumentChunks(userId, file.id).catch(() => false);
  }

  return prisma.file.findMany({
    where: {
      userId,
      deletedAt: null,
      chunks: { some: {} },
    },
    select: { id: true, originalName: true, extension: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 200,
  });
}

/**
 * Retrieves the most relevant document sections for a question. Uses provider
 * embeddings when available and local hashed embeddings otherwise, comparing
 * only vectors produced by the same model.
 */
export async function retrieveRelevantSources(
  userId: string,
  query: string,
  options: { fileId?: string; limit?: number } = {},
): Promise<RetrievalSource[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 6, 10));
  const [variants, files] = await Promise.all([
    createQueryEmbeddingVariants(query),
    candidateFiles(userId, options.fileId),
  ]);
  if (!files.length) return [];

  const fileMap = new Map(files.map((file) => [file.id, file]));
  const tokens = tokenizeForEmbedding(query);

  const chunks = await prisma.documentChunk.findMany({
    where: options.fileId
      ? { userId, fileId: options.fileId }
      : { userId, fileId: { in: files.map((file) => file.id) } },
    select: {
      fileId: true,
      section: true,
      chunkIndex: true,
      content: true,
      vector: true,
      model: true,
    },
    take: MAX_DOCUMENT_CHUNKS,
  });

  const scored = chunks
    .map((chunk) => {
      const queryVector = pickQueryVector(variants, chunk.model);
      const similarity = queryVector
        ? cosineSimilarity(queryVector, parseEmbedding(chunk.vector))
        : 0;
      const lexical = lexicalScore(tokens, chunk.content);
      const score = similarity * 0.85 + lexical * 0.15;
      return {
        fileId: chunk.fileId,
        section: chunk.section,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        score,
        lexical,
      };
    })
    .filter((chunk) => chunk.score > 0.02 || chunk.lexical > 0.06)
    .sort((left, right) => right.score - left.score);

  const perFile = new Map<string, number>();
  const perFileCap = options.fileId ? limit : 2;
  const selected: RetrievalSource[] = [];

  for (const chunk of scored) {
    if (selected.length >= limit) break;
    const count = perFile.get(chunk.fileId) ?? 0;
    if (count >= perFileCap) continue;
    const file = fileMap.get(chunk.fileId);
    if (!file) continue;
    perFile.set(chunk.fileId, count + 1);
    selected.push({
      fileId: chunk.fileId,
      fileName: file.originalName,
      extension: file.extension,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: Number(chunk.score.toFixed(4)),
    });
  }

  // If semantic scoring found nothing (for example a brand-new local index),
  // still provide the leading sections of the selected files.
  if (!selected.length) {
    for (const file of files.slice(0, options.fileId ? 1 : MAX_CONTEXT_FILES)) {
      const first = chunks.find((chunk) => chunk.fileId === file.id);
      if (!first) continue;
      selected.push({
        fileId: file.id,
        fileName: file.originalName,
        extension: file.extension,
        section: first.section,
        chunkIndex: first.chunkIndex,
        content: first.content,
        score: 0,
      });
    }
  }

  return selected;
}

function nameOverlap(baseName: string, candidateName: string): number {
  const baseTokens = tokenizeForEmbedding(baseName);
  if (!baseTokens.length) return 0;
  const lower = candidateName.toLowerCase();
  let matches = 0;
  for (const token of baseTokens) {
    if (lower.includes(token)) matches += 1;
  }
  return matches / baseTokens.length;
}

export async function findSimilarDocuments(
  userId: string,
  fileId: string,
  limit = 6,
): Promise<SimilarDocumentView[]> {
  const base = await prisma.file.findFirst({
    where: { id: fileId, userId, deletedAt: null },
    select: {
      id: true,
      originalName: true,
      embedding: { select: { vector: true, model: true } },
      tags: { select: { name: true } },
    },
  });
  if (!base) return [];

  let baseEmbedding = base.embedding;
  if (!baseEmbedding) {
    await buildFileEmbedding(userId, fileId).catch(() => false);
    baseEmbedding = await prisma.fileEmbedding.findUnique({
      where: { fileId },
      select: { vector: true, model: true },
    });
  }
  const baseVector = baseEmbedding ? parseEmbedding(baseEmbedding.vector) : [];
  const baseTags = new Set(base.tags.map((tag) => tag.name.toLowerCase()));

  const files = await prisma.file.findMany({
    where: { userId, deletedAt: null, id: { not: fileId } },
    select: {
      id: true,
      originalName: true,
      extension: true,
      size: true,
      folder: true,
      updatedAt: true,
      parentFolder: { select: { name: true } },
      embedding: { select: { vector: true, model: true } },
      tags: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 500,
  });

  const scored = files
    .map((file) => {
      const fileTags = new Set(file.tags.map((tag) => tag.name.toLowerCase()));
      const shared = [...baseTags].filter((tag) => fileTags.has(tag));
      const tagScore = baseTags.size ? shared.length / baseTags.size : 0;
      const nameScore = nameOverlap(base.originalName, file.originalName);
      const vectorScore =
        baseEmbedding &&
        file.embedding &&
        file.embedding.model === baseEmbedding.model
          ? cosineSimilarity(
              baseVector,
              parseEmbedding(file.embedding.vector),
            )
          : 0;
      const score = vectorScore * 0.75 + tagScore * 0.15 + nameScore * 0.1;
      return {
        id: file.id,
        originalName: file.originalName,
        extension: file.extension,
        size: file.size.toString(),
        folderName: file.parentFolder?.name ?? file.folder ?? "/",
        updatedAt: file.updatedAt.toISOString(),
        score: Number(score.toFixed(4)),
        sharedTags: file.tags
          .filter((tag) => shared.includes(tag.name.toLowerCase()))
          .map((tag) => tag.name)
          .slice(0, 4),
      };
    })
    .filter((file) => file.score > 0.06)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return scored;
}
