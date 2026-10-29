export type DocumentChunkDraft = {
  index: number;
  section: string;
  content: string;
  charStart: number;
  charEnd: number;
};

export type ChunkOptions = {
  maxChars?: number;
  overlapChars?: number;
  maxChunks?: number;
};

type Heading = { index: number; title: string };

const BREAKS = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "];

function cleanHeading(value: string): string {
  return value
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function collectHeadings(text: string): Heading[] {
  const headings: Heading[] = [];
  const pattern = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const title = cleanHeading(match[2]);
    if (title) headings.push({ index: match.index, title });
  }
  return headings;
}

function sectionAt(
  headings: Heading[],
  start: number,
  fallbackIndex: number,
  maxChars: number,
): string {
  // Prefer a heading that starts within the first part of the chunk.
  for (const heading of headings) {
    if (heading.index >= start && heading.index <= start + Math.min(200, maxChars)) {
      return heading.title;
    }
  }
  let current = "";
  for (const heading of headings) {
    if (heading.index > start) break;
    current = heading.title;
  }
  if (current) return current;
  return `Section ${Math.floor(start / maxChars) + 1}`;
}

/**
 * Splits extracted document text into overlapping chunks for retrieval.
 * Pure and deterministic so it can be unit tested without a database.
 */
export function splitIntoChunks(
  text: string,
  options: ChunkOptions = {},
): DocumentChunkDraft[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.trim()) return [];

  const maxChars = Math.max(200, options.maxChars ?? 1_200);
  const overlapChars = Math.max(
    0,
    Math.min(options.overlapChars ?? 180, Math.floor(maxChars / 2)),
  );
  const maxChunks = Math.max(1, options.maxChunks ?? 120);
  const headings = collectHeadings(normalized);

  const chunks: DocumentChunkDraft[] = [];
  let cursor = 0;

  while (cursor < normalized.length && chunks.length < maxChunks) {
    let end = Math.min(normalized.length, cursor + maxChars);

    if (end < normalized.length) {
      const windowStart = Math.max(
        cursor + Math.floor(maxChars * 0.55),
        cursor + 1,
      );
      const window = normalized.slice(windowStart, end);
      for (const breakPattern of BREAKS) {
        const found = window.lastIndexOf(breakPattern);
        if (found !== -1) {
          end = windowStart + found + breakPattern.length;
          break;
        }
      }
    }

    let start = cursor;
    while (start < end && /\s/.test(normalized[start])) start += 1;
    let contentEnd = end;
    while (contentEnd > start && /\s/.test(normalized[contentEnd - 1])) {
      contentEnd -= 1;
    }

    const content = normalized.slice(start, contentEnd);
    if (content.trim()) {
      chunks.push({
        index: chunks.length,
        section: sectionAt(headings, start, chunks.length, maxChars),
        content,
        charStart: start,
        charEnd: contentEnd,
      });
    }

    if (end >= normalized.length) break;

    let next = end - overlapChars;
    if (next <= cursor) next = end;
    while (next < normalized.length && /\s/.test(normalized[next])) next += 1;
    cursor = next;
  }

  return chunks;
}
