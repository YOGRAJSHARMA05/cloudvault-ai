export type DerivedTag = {
  name: string;
  category: string;
  confidence: number;
};

export type TagInput = {
  fileName: string;
  extension: string;
  mimeType?: string;
  text?: string;
  keywords?: string[];
};

const CATEGORY_BY_EXTENSION: Record<string, string> = {
  pdf: "Documents",
  doc: "Documents",
  docx: "Documents",
  txt: "Documents",
  md: "Documents",
  markdown: "Documents",
  rtf: "Documents",
  odt: "Documents",
  csv: "Data",
  json: "Data",
  xml: "Data",
  yml: "Data",
  yaml: "Data",
  toml: "Data",
  ini: "Data",
  js: "Code",
  jsx: "Code",
  ts: "Code",
  tsx: "Code",
  py: "Code",
  rb: "Code",
  go: "Code",
  rs: "Code",
  java: "Code",
  c: "Code",
  h: "Code",
  cpp: "Code",
  hpp: "Code",
  cs: "Code",
  php: "Code",
  swift: "Code",
  kt: "Code",
  sh: "Code",
  sql: "Code",
  html: "Code",
  css: "Code",
  scss: "Code",
  png: "Images",
  jpg: "Images",
  jpeg: "Images",
  webp: "Images",
  gif: "Images",
  svg: "Images",
  mp4: "Media",
  mov: "Media",
  mp3: "Media",
  wav: "Media",
  zip: "Archives",
  rar: "Archives",
  "7z": "Archives",
  tar: "Archives",
  gz: "Archives",
};

const TEXT_CATEGORY_SIGNALS: Array<{ category: string; pattern: RegExp }> = [
  { category: "Finance", pattern: /\b(invoice|receipt|budget|revenue|expense|payroll|tax|financial|quarterly)\b/i },
  { category: "Legal", pattern: /\b(contract|agreement|terms|privacy policy|nda|compliance|litigation)\b/i },
  { category: "Career", pattern: /\b(resume|curriculum vitae|cover letter|candidate|job description)\b/i },
  { category: "Reports", pattern: /\b(report|analysis|findings|metrics|summary|assessment|review)\b/i },
  { category: "Product", pattern: /\b(roadmap|specification|spec|feature|requirement|user story)\b/i },
  { category: "Design", pattern: /\b(design|wireframe|mockup|figma|prototype|typography)\b/i },
  { category: "Marketing", pattern: /\b(marketing|campaign|seo|newsletter|audience|brand)\b/i },
];

const IGNORED_TAGS = new Set([
  "file", "document", "document content", "content", "page", "pages", "section",
  "figure", "table", "chapter", "example", "available", "preview", "download",
]);

export function categoryForFile(input: TagInput): string {
  const sample = `${input.fileName}\n${input.text?.slice(0, 8_000) ?? ""}`;
  for (const signal of TEXT_CATEGORY_SIGNALS) {
    if (signal.pattern.test(sample)) return signal.category;
  }
  return CATEGORY_BY_EXTENSION[input.extension.toLowerCase()] ?? "General";
}

function normalizeTag(value: string): string {
  return value
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/**
 * Parses a provider JSON response of the shape
 * `{ "tags": string[], "category": string }`. Returns null when the payload
 * cannot be validated so callers can fall back to local tags.
 */
export function parseProviderTags(
  value: string,
): { tags: string[]; category: string | null } | null {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as {
      tags?: unknown;
      category?: unknown;
    };
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((tag): tag is string => typeof tag === "string")
          .map(normalizeTag)
          .filter((tag) => tag.length >= 2 && tag.length <= 40)
      : [];
    if (!tags.length) return null;
    const category =
      typeof parsed.category === "string" && parsed.category.trim()
        ? normalizeTag(parsed.category)
        : null;
    return { tags: [...new Set(tags)].slice(0, 10), category };
  } catch {
    return null;
  }
}

/**
 * Deterministic tag/category derivation used when no AI provider key is
 * configured (and as the safety net if a provider call fails).
 */
export function deriveLocalTags(input: TagInput, limit = 8): DerivedTag[] {
  const category = categoryForFile(input);
  const seen = new Set<string>([category.toLowerCase()]);
  const tags: DerivedTag[] = [];

  const candidates = [
    ...(input.keywords ?? []),
    ...input.fileName
      .replace(/\.[^.]+$/, "")
      .split(/[^\p{L}\p{N}+#]+/u),
  ];

  for (const candidate of candidates) {
    const name = normalizeTag(candidate);
    if (name.length < 3 || name.length > 40) continue;
    if (/^\d+$/.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key) || IGNORED_TAGS.has(key)) continue;
    seen.add(key);
    tags.push({
      name,
      category,
      confidence: Math.max(0.35, 0.72 - tags.length * 0.04),
    });
    if (tags.length >= limit) break;
  }

  return tags;
}
