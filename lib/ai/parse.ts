export type ParsedSummary = {
  executiveSummary: string;
  keyPoints: string[];
  importantTechnologies: string[];
  importantDates: string[];
  actionItems: string[];
};

export function extractJsonObject(value: string): Record<string, unknown> | null {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown, max = 8, maxLength = 240): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const clean = entry.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    result.push(clean.slice(0, maxLength));
    if (result.length >= max) break;
  }
  return result;
}

export function parseSummaryPayload(value: string): ParsedSummary | null {
  const parsed = extractJsonObject(value);
  if (!parsed) return null;
  const executiveSummary =
    typeof parsed.executiveSummary === "string"
      ? parsed.executiveSummary.replace(/\s+/g, " ").trim()
      : "";
  if (!executiveSummary) return null;
  return {
    executiveSummary: executiveSummary.slice(0, 1_200),
    keyPoints: stringArray(parsed.keyPoints),
    importantTechnologies: stringArray(parsed.importantTechnologies, 10, 60),
    importantDates: stringArray(parsed.importantDates, 8, 40),
    actionItems: stringArray(parsed.actionItems),
  };
}

export function parseKeywordPayload(value: string): string[] | null {
  const parsed = extractJsonObject(value);
  if (!parsed) return null;
  const keywords = stringArray(parsed.keywords, 15, 40).filter(
    (keyword) => keyword.length >= 2,
  );
  return keywords.length ? keywords : null;
}
