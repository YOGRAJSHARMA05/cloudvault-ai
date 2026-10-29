import "server-only";

import {
  computeStats,
  detectLanguage,
  extractKeywords,
  generateSummary,
} from "@/lib/ai/analysis";
import { createStoredEmbedding } from "@/lib/ai/embeddings";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { deriveLocalTags } from "@/lib/ai/local-tags";
import { indexDocumentChunks } from "@/lib/ai/rag";
import { prisma } from "@/lib/prisma";

import { createLogger } from "@/lib/logger";

const log = createLogger("ai:process");

export type FileProcessingResult = {
  metadata: boolean;
  summary: boolean;
  embedding: boolean;
  tags: boolean;
  chunks: boolean;
};

/**
 * Builds the AI metadata, summary, and embedding for a file.
 *
 * This is intentionally best-effort: a failure in one step never prevents the
 * other steps from completing, and it never fails the original upload.
 */
export async function processFileAnalysis(
  userId: string,
  fileId: string,
): Promise<FileProcessingResult> {
  const result: FileProcessingResult = {
    metadata: false,
    summary: false,
    embedding: false,
    tags: false,
    chunks: false,
  };

  const file = await prisma.file.findFirst({
    where: { id: fileId, userId, deletedAt: null },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      extension: true,
      size: true,
      createdAt: true,
    },
  });
  if (!file) return result;

  const extracted = await extractDocumentText(userId, fileId);
  const text = extracted?.text ?? "";
  const stats = computeStats(text);
  const language = detectLanguage(text);
  const pageCount =
    file.extension.toLowerCase() === "pdf"
      ? Math.max(1, Math.ceil(stats.wordCount / 250))
      : null;

  try {
    await prisma.documentMetadata.upsert({
      where: { fileId },
      create: {
        fileId,
        userId,
        title: file.originalName.replace(/\.[^.]+$/, ""),
        pageCount,
        wordCount: stats.wordCount,
        characterCount: stats.characterCount,
        readingTimeMinutes: stats.readingTimeMinutes,
        language,
        headingsCount: stats.headingsCount,
        paragraphsCount: stats.paragraphsCount,
        fileSize: file.size.toString(),
        fileType: file.mimeType,
      },
      update: {
        title: file.originalName.replace(/\.[^.]+$/, ""),
        pageCount,
        wordCount: stats.wordCount,
        characterCount: stats.characterCount,
        readingTimeMinutes: stats.readingTimeMinutes,
        language,
        headingsCount: stats.headingsCount,
        paragraphsCount: stats.paragraphsCount,
        fileSize: file.size.toString(),
        fileType: file.mimeType,
      },
    });
    result.metadata = true;
  } catch (error) {
    log.error("Failed to generate document metadata", error);
  }

  try {
    const summary = generateSummary(text);
    await prisma.documentSummary.upsert({
      where: { fileId },
      create: {
        fileId,
        userId,
        executiveSummary: summary.executiveSummary,
        keyPoints: summary.keyPoints,
        importantTechnologies: summary.importantTechnologies,
        importantDates: summary.importantDates,
        actionItems: summary.actionItems,
        provider: "local",
        model: null,
      },
      update: {
        executiveSummary: summary.executiveSummary,
        keyPoints: summary.keyPoints,
        importantTechnologies: summary.importantTechnologies,
        importantDates: summary.importantDates,
        actionItems: summary.actionItems,
        provider: "local",
        model: null,
      },
    });
    result.summary = true;
  } catch (error) {
    log.error("Failed to generate document summary", error);
  }

  try {
    const vector = await createStoredEmbedding(
      [
        file.originalName,
        file.extension,
        file.mimeType,
        extracted?.text ?? "",
      ].join("\n"),
      "RETRIEVAL_DOCUMENT",
    );
    await prisma.fileEmbedding.upsert({
      where: { fileId },
      create: {
        fileId,
        userId,
        vector: vector.vector,
        dimensions: vector.dimensions,
        model: vector.model,
      },
      update: {
        vector: vector.vector,
        dimensions: vector.dimensions,
        model: vector.model,
      },
    });
    result.embedding = true;
  } catch (error) {
    log.error("Failed to generate file embedding", error);
  }

  try {
    const tags = deriveLocalTags({
      fileName: file.originalName,
      extension: file.extension,
      mimeType: file.mimeType,
      text,
      keywords: extractKeywords(text, 12),
    });
    await prisma.fileTag.deleteMany({
      where: { fileId, userId, source: "local" },
    });
    if (tags.length) {
      await prisma.fileTag.createMany({
        data: tags.map((tag) => ({
          fileId,
          userId,
          name: tag.name,
          category: tag.category,
          confidence: tag.confidence,
          source: "local",
        })),
        skipDuplicates: true,
      });
    }
    result.tags = true;
  } catch (error) {
    log.error("Failed to generate file tags", error);
  }

  try {
    result.chunks = await indexDocumentChunks(userId, fileId, {
      text,
      fileName: file.originalName,
      extension: file.extension,
    });
  } catch (error) {
    log.error("Failed to index document chunks", error);
  }

  return result;
}
