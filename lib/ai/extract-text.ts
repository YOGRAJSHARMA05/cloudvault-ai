import "server-only";

import { readUserFile } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "swift",
  "kt",
  "sh",
  "sql",
  "html",
  "css",
  "scss",
  "yml",
  "yaml",
  "xml",
  "toml",
  "ini",
]);

const MAX_EXTRACTED_CHARACTERS = 250_000;

export type ExtractedDocument = {
  text: string;
  mimeType: string;
  extension: string;
  originalName: string;
};

function limitText(text: string): string {
  return text.length > MAX_EXTRACTED_CHARACTERS
    ? text.slice(0, MAX_EXTRACTED_CHARACTERS)
    : text;
}

export async function extractDocumentText(
  userId: string,
  fileId: string,
): Promise<ExtractedDocument | null> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId, deletedAt: null },
    select: {
      storedName: true,
      mimeType: true,
      extension: true,
      originalName: true,
    },
  });
  if (!file) return null;

  try {
    const buffer = await readUserFile(userId, file.storedName);
    const ext = file.extension.toLowerCase();
    const base = {
      mimeType: file.mimeType,
      extension: ext,
      originalName: file.originalName,
    };

    if (ext === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const data = await parser.getText();
        return { ...base, text: limitText(data.text || "") };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }

    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return { ...base, text: limitText(result.value || "") };
    }

    if (ext === "doc") {
      return null;
    }

    if (TEXT_EXTENSIONS.has(ext)) {
      return { ...base, text: limitText(buffer.toString("utf-8")) };
    }

    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      return {
        ...base,
        text: limitText(
          `Image file: ${file.originalName}. Visual content is available in the preview.`,
        ),
      };
    }

    if (ext === "mp4" || ext === "mp3") {
      return {
        ...base,
        text: limitText(
          `${ext === "mp3" ? "Audio" : "Video"} file: ${file.originalName}. Media content is available in the preview.`,
        ),
      };
    }

    return null;
  } catch {
    return null;
  }
}
