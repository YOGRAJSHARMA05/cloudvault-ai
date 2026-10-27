import "server-only";

import { readUserFile } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";

export async function extractDocumentText(userId: string, fileId: string): Promise<{ text: string; mimeType: string; extension: string; originalName: string } | null> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId },
    select: { storedName: true, mimeType: true, extension: true, originalName: true },
  });
  if (!file) return null;

  try {
    const buffer = await readUserFile(userId, file.storedName);
    const ext = file.extension.toLowerCase();

    if (ext === "txt") {
      return { text: buffer.toString("utf-8"), mimeType: file.mimeType, extension: ext, originalName: file.originalName };
    }

    if (ext === "pdf") {
      try {
        // Try to use pdf-parse if available, otherwise fallback
        const mod = await import("pdf-parse").catch(() => null) as unknown;
        if (mod) {
          const modObj = mod as { default?: (b: Buffer) => Promise<{ text: string }> } | ((b: Buffer) => Promise<{ text: string }>);
          const parse = typeof modObj === "function" ? modObj : (modObj.default as (b: Buffer) => Promise<{ text: string }>);
          const data = await parse(buffer);
          return { text: data.text || "", mimeType: file.mimeType, extension: ext, originalName: file.originalName };
        }
      } catch {
        // ignore
      }
      // Fallback: try to extract readable text
      const text = buffer.toString("latin1");
      const cleaned = text.replace(/[\x00-\x1F\x7F-\x9F]/g, " ").replace(/\s+/g, " ");
      return { text: cleaned.slice(0, 50000), mimeType: file.mimeType, extension: ext, originalName: file.originalName };
    }

    // For images/docs, try best effort
    if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      return { text: `Image file: ${file.originalName}. No text extracted.`, mimeType: file.mimeType, extension: ext, originalName: file.originalName };
    }

    return { text: buffer.toString("utf-8", 0, Math.min(buffer.length, 50000)), mimeType: file.mimeType, extension: ext, originalName: file.originalName };
  } catch {
    return null;
  }
}
