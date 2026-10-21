import { z } from "zod";
import { FILE_PAGE_SIZE } from "@/constants/files";
import { sanitizeOriginalName } from "@/lib/file-storage";

export const listFilesSchema = z.object({
  query: z.string().trim().max(120).default(""),
  category: z
    .enum(["all", "images", "documents", "pdf", "videos", "audio", "other", "favorites"])
    .default("all"),
  sort: z
    .enum(["newest", "oldest", "largest", "smallest", "name-asc", "name-desc"])
    .default("newest"),
  page: z.number().int().min(1).max(100_000).default(1),
});

export const renameFileSchema = z.object({
  fileId: z.string().cuid(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .transform((value, context) => {
      try {
        return sanitizeOriginalName(value);
      } catch {
        context.addIssue({ code: "custom", message: "Enter a valid file name." });
        return z.NEVER;
      }
    }),
});

export const fileIdSchema = z.object({ fileId: z.string().cuid() });

export const fileUploadMetadataSchema = z.object({
  fileName: z.string().trim().min(1).max(1024),
  fileSize: z.number().int().positive().max(25 * 1024 * 1024),
  fileType: z.string().max(128),
  folderId: z.string().cuid().nullable(),
});

export function getFilePageOffset(page: number): number {
  return (page - 1) * FILE_PAGE_SIZE;
}