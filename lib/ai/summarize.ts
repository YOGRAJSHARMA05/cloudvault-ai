import "server-only";

import { extractKeywords, generateSummary } from "@/lib/ai/analysis";
import { isProviderConfigured } from "@/lib/ai/config";
import {
  parseKeywordPayload,
  parseSummaryPayload,
  type ParsedSummary,
} from "@/lib/ai/parse";
import { completeProviderText } from "@/lib/ai/provider";

export type GeneratedSummary = {
  summary: ParsedSummary;
  provider: string;
  model: string | null;
};

export async function summarizeDocument(
  text: string,
  fileName: string,
): Promise<GeneratedSummary> {
  if (isProviderConfigured() && text.trim()) {
    const completion = await completeProviderText({
      system: [
        "You summarize documents for a secure file workspace.",
        "Return ONLY JSON with keys: executiveSummary (string), keyPoints (string[]),",
        "importantTechnologies (string[]), importantDates (string[]), actionItems (string[]).",
        "Be factual and use only the supplied text. Keep the summary under 120 words.",
      ].join(" "),
      prompt: [
        `File name: ${fileName}`,
        "",
        "Document text (truncated):",
        text.slice(0, 16_000),
      ].join("\n"),
    });

    if (completion) {
      const parsed = parseSummaryPayload(completion.text);
      if (parsed) {
        return {
          summary: parsed,
          provider: completion.provider,
          model: completion.model,
        };
      }
    }
  }

  return {
    summary: generateSummary(text),
    provider: "local",
    model: null,
  };
}

export async function generateSmartKeywords(
  text: string,
  fileName: string,
): Promise<{ keywords: string[]; provider: string; model: string | null }> {
  if (isProviderConfigured() && text.trim()) {
    const completion = await completeProviderText({
      system: [
        "Extract 8-15 specific keywords or short phrases from the document.",
        'Return ONLY JSON with the shape {"keywords": string[]}.',
        "Prefer domain terms and named technologies over generic words.",
      ].join(" "),
      prompt: [
        `File name: ${fileName}`,
        "",
        "Document text (truncated):",
        text.slice(0, 12_000),
      ].join("\n"),
    });

    if (completion) {
      const keywords = parseKeywordPayload(completion.text);
      if (keywords) {
        return {
          keywords,
          provider: completion.provider,
          model: completion.model,
        };
      }
    }
  }

  return {
    keywords: extractKeywords(text, 15),
    provider: "local",
    model: null,
  };
}
