export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const FILE_PAGE_SIZE = 50;

type AllowedFileType = {
  mimeType: string;
  category: string;
  altMimeTypes?: readonly string[];
};

export const ALLOWED_FILE_TYPES = {
  pdf: { mimeType: "application/pdf", category: "documents" },
  doc: { mimeType: "application/msword", category: "documents" },
  docx: {
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "documents",
  },
  txt: {
    mimeType: "text/plain",
    category: "documents",
    altMimeTypes: ["application/octet-stream"],
  },
  md: {
    mimeType: "text/markdown",
    category: "documents",
    altMimeTypes: ["text/plain", "text/x-markdown"],
  },
  markdown: {
    mimeType: "text/markdown",
    category: "documents",
    altMimeTypes: ["text/plain", "text/x-markdown"],
  },
  csv: {
    mimeType: "text/csv",
    category: "documents",
    altMimeTypes: ["text/plain", "application/csv", "application/vnd.ms-excel"],
  },
  json: {
    mimeType: "application/json",
    category: "documents",
    altMimeTypes: ["text/plain", "text/json", "application/octet-stream"],
  },
  png: { mimeType: "image/png", category: "images" },
  jpg: { mimeType: "image/jpeg", category: "images" },
  jpeg: { mimeType: "image/jpeg", category: "images" },
  webp: { mimeType: "image/webp", category: "images" },
  gif: { mimeType: "image/gif", category: "images" },
  mp4: {
    mimeType: "video/mp4",
    category: "videos",
    altMimeTypes: ["application/mp4"],
  },
  mp3: {
    mimeType: "audio/mpeg",
    category: "audio",
    altMimeTypes: ["audio/mp3", "audio/mpeg3", "audio/x-mpeg-3"],
  },
  js: {
    mimeType: "text/javascript",
    category: "documents",
    altMimeTypes: ["application/javascript", "text/plain", "application/x-javascript"],
  },
  jsx: {
    mimeType: "text/javascript",
    category: "documents",
    altMimeTypes: ["application/javascript", "text/plain"],
  },
  ts: {
    mimeType: "text/typescript",
    category: "documents",
    altMimeTypes: ["application/typescript", "text/plain", "video/mp2t"],
  },
  tsx: {
    mimeType: "text/typescript",
    category: "documents",
    altMimeTypes: ["application/typescript", "text/plain", "video/mp2t"],
  },
  py: { mimeType: "text/x-python", category: "documents", altMimeTypes: ["text/plain"] },
  rb: { mimeType: "text/x-ruby", category: "documents", altMimeTypes: ["text/plain"] },
  go: { mimeType: "text/x-go", category: "documents", altMimeTypes: ["text/plain"] },
  rs: { mimeType: "text/x-rust", category: "documents", altMimeTypes: ["text/plain"] },
  java: { mimeType: "text/x-java", category: "documents", altMimeTypes: ["text/plain"] },
  c: { mimeType: "text/x-c", category: "documents", altMimeTypes: ["text/plain"] },
  h: { mimeType: "text/x-c", category: "documents", altMimeTypes: ["text/plain"] },
  cpp: { mimeType: "text/x-c++", category: "documents", altMimeTypes: ["text/plain"] },
  hpp: { mimeType: "text/x-c++", category: "documents", altMimeTypes: ["text/plain"] },
  cs: { mimeType: "text/x-csharp", category: "documents", altMimeTypes: ["text/plain"] },
  php: { mimeType: "text/x-php", category: "documents", altMimeTypes: ["text/plain"] },
  swift: { mimeType: "text/x-swift", category: "documents", altMimeTypes: ["text/plain"] },
  kt: { mimeType: "text/x-kotlin", category: "documents", altMimeTypes: ["text/plain"] },
  sh: { mimeType: "application/x-sh", category: "documents", altMimeTypes: ["text/plain", "text/x-shellscript"] },
  sql: { mimeType: "application/sql", category: "documents", altMimeTypes: ["text/plain", "text/x-sql"] },
  html: { mimeType: "text/html", category: "documents", altMimeTypes: ["text/plain"] },
  css: { mimeType: "text/css", category: "documents", altMimeTypes: ["text/plain"] },
  scss: { mimeType: "text/x-scss", category: "documents", altMimeTypes: ["text/plain"] },
  yml: { mimeType: "application/yaml", category: "documents", altMimeTypes: ["text/plain", "text/yaml", "text/x-yaml"] },
  yaml: { mimeType: "application/yaml", category: "documents", altMimeTypes: ["text/plain", "text/yaml", "text/x-yaml"] },
  xml: { mimeType: "application/xml", category: "documents", altMimeTypes: ["text/plain", "text/xml"] },
  toml: { mimeType: "application/toml", category: "documents", altMimeTypes: ["text/plain"] },
  ini: { mimeType: "text/plain", category: "documents" },
} as const satisfies Record<string, AllowedFileType>;

export type AllowedExtension = keyof typeof ALLOWED_FILE_TYPES;

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_FILE_TYPES) as AllowedExtension[];

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
