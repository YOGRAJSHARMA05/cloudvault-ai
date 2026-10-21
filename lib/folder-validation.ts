import { z } from "zod";

const reservedNames = new Set([
  ".",
  "..",
  "root",
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Folder name is required.")
  .max(80, "Folder names can be at most 80 characters.")
  .refine((name) => !/[\\/\u0000-\u001f\u007f]/.test(name), {
    message: "Folder names cannot contain slashes or control characters.",
  })
  .refine((name) => !/[. ]$/.test(name), {
    message: "Folder names cannot end with a period or space.",
  })
  .refine((name) => !reservedNames.has(name.toLowerCase()), {
    message: "That folder name is reserved.",
  });

export const folderIdSchema = z.string().cuid();

export const createFolderSchema = z.object({
  name: folderNameSchema,
  parentFolderId: folderIdSchema.nullable().default(null),
  color: z.enum(["blue", "violet", "amber", "emerald", "rose", "slate"]).default("blue"),
  icon: z.enum(["folder", "briefcase", "image", "document", "star"]).default("folder"),
});

export const renameFolderSchema = z.object({
  folderId: folderIdSchema,
  name: folderNameSchema,
});

export const moveFolderSchema = z.object({
  folderId: folderIdSchema,
  parentFolderId: folderIdSchema.nullable(),
});

export const folderContentsSchema = z.object({
  folderId: folderIdSchema.nullable().default(null),
  query: z.string().trim().max(120).default(""),
  category: z.enum(["all", "images", "documents", "pdf", "videos", "audio", "other", "favorites"]).default("all"),
  sort: z.enum(["newest", "oldest", "largest", "smallest", "name-asc", "name-desc"]).default("newest"),
  page: z.number().int().min(1).max(100_000).default(1),
});

export const moveFileSchema = z.object({
  fileId: folderIdSchema,
  folderId: folderIdSchema.nullable(),
});

export const workspaceSearchSchema = z.object({
  query: z.string().trim().min(1).max(120),
  page: z.number().int().min(1).max(100_000).default(1),
});

export function createFolderSlug(name: string): string {
  const normalized = name.normalize("NFKC").toLocaleLowerCase("en-US");
  return normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}