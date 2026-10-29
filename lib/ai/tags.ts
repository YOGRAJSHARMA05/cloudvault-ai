import "server-only";

import { extractKeywords } from "@/lib/ai/analysis";
import { isProviderConfigured } from "@/lib/ai/config";
import { extractDocumentText } from "@/lib/ai/extract-text";
import {
  categoryForFile,
  deriveLocalTags,
  parseProviderTags,
} from "@/lib/ai/local-tags";
import { completeProviderText } from "@/lib/ai/provider";
import { prisma } from "@/lib/prisma";
import type { FileTagView } from "@/types/ai";

import { createLogger } from "@/lib/logger";

const log = createLogger("ai:tags");

export class FileTagError extends Error {
  code: "not_found" | "failed";

  constructor(message: string, code: "not_found" | "failed" = "failed") {
    super(message);
    this.name = "FileTagError";
    this.code = code;
  }
}

function toView(tag: {
  id: string;
  name: string;
  category: string;
  confidence: number;
  source: string;
}): FileTagView {
  return {
    id: tag.id,
    name: tag.name,
    category: tag.category,
    confidence: tag.confidence,
    source: tag.source,
  };
}

export async function getFileTags(
  userId: string,
  fileId: string,
): Promise<FileTagView[]> {
  const tags = await prisma.fileTag.findMany({
    where: { userId, fileId },
    orderBy: [{ confidence: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      confidence: true,
      source: true,
    },
  });
  return tags.map(toView);
}

export async function generateFileTags(
  userId: string,
  fileId: string,
  options: { refresh?: boolean } = {},
): Promise<{ tags: FileTagView[]; source: string }> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId, deletedAt: null },
    select: {
      id: true,
      originalName: true,
      extension: true,
      mimeType: true,
    },
  });
  if (!file) throw new FileTagError("File not found.", "not_found");

  const existing = await prisma.fileTag.findMany({
    where: { userId, fileId },
    orderBy: [{ confidence: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      confidence: true,
      source: true,
    },
  });
  if (existing.length && !options.refresh) {
    return { tags: existing.map(toView), source: existing[0]?.source ?? "local" };
  }

  const extracted = await extractDocumentText(userId, fileId);
  const text = extracted?.text ?? "";
  const keywords = extractKeywords(text, 15);

  let source = "local";
  let derived = deriveLocalTags({
    fileName: file.originalName,
    extension: file.extension,
    mimeType: file.mimeType,
    text,
    keywords,
  });

  if (isProviderConfigured() && text.trim()) {
    const completion = await completeProviderText({
      system: [
        "You generate short file tags and one category for a document workspace.",
        "Return ONLY JSON with the shape {\"tags\": string[], \"category\": string}.",
        "Tags must be 2-4 words, lowercase, specific, and free of personal data.",
        "Category must be one of: Documents, Data, Code, Images, Media, Finance, Legal, Career, Reports, Product, Design, Marketing, General.",
      ].join(" "),
      prompt: [
        `File name: ${file.originalName}`,
        `Extension: ${file.extension}`,
        "",
        "Document text (truncated):",
        text.slice(0, 8_000),
      ].join("\n"),
    });

    if (completion) {
      const parsed = parseProviderTags(completion.text);
      if (parsed) {
        const category =
          parsed.category ?? categoryForFile({
            fileName: file.originalName,
            extension: file.extension,
            text,
          });
        derived = parsed.tags.map((tag, index) => ({
          name: tag,
          category,
          confidence: Math.max(0.55, 0.9 - index * 0.04),
        }));
        source = completion.provider;
      }
    }
  }

  if (!derived.length) {
    derived = deriveLocalTags({
      fileName: file.originalName,
      extension: file.extension,
      mimeType: file.mimeType,
      text,
      keywords,
    });
  }

  try {
    await prisma.$transaction([
      prisma.fileTag.deleteMany({ where: { userId, fileId } }),
      prisma.fileTag.createMany({
        data: derived.map((tag) => ({
          userId,
          fileId,
          name: tag.name,
          category: tag.category,
          confidence: tag.confidence,
          source,
        })),
        skipDuplicates: true,
      }),
    ]);
  } catch (error) {
    log.error("Failed to store AI file tags", error);
    throw new FileTagError("Could not save AI tags.", "failed");
  }

  return { tags: await getFileTags(userId, fileId), source };
}
