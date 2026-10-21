export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const FILE_PAGE_SIZE = 50;

export const ALLOWED_FILE_TYPES = {
  pdf: { mimeType: "application/pdf", category: "documents" },
  doc: { mimeType: "application/msword", category: "documents" },
  docx: {
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "documents",
  },
  txt: { mimeType: "text/plain", category: "documents" },
  png: { mimeType: "image/png", category: "images" },
  jpg: { mimeType: "image/jpeg", category: "images" },
  jpeg: { mimeType: "image/jpeg", category: "images" },
  webp: { mimeType: "image/webp", category: "images" },
} as const;

export type FileCategory =
  | "all"
  | "images"
  | "documents"
  | "pdf"
  | "videos"
  | "audio"
  | "other"
  | "favorites";
export type FileSort =
  | "newest"
  | "oldest"
  | "largest"
  | "smallest"
  | "name-asc"
  | "name-desc";