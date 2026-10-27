export function computeStats(text: string) {
  const cleaned = text.replace(/\r\n/g, "\n");
  const words = cleaned.trim() ? cleaned.trim().split(/\s+/).filter(Boolean) : [];
  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const headings = (cleaned.match(/^#{1,6}\s+.+$/gm) || cleaned.match(/^[A-Z][A-Z\s]{3,}$/gm) || []).length;
  const wordCount = words.length;
  const characterCount = text.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
  return {
    wordCount,
    characterCount,
    readingTimeMinutes,
    paragraphsCount: paragraphs.length,
    headingsCount: headings,
  };
}

export function extractKeywords(text: string, count = 15): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "get", "got", "getting", "to", "of", "in", "for", "on", "with", "at", "by", "from", "up", "about", "into", "through", "during", "before", "after", "above", "below", "between", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "this", "that", "these", "those", "i", "me", "my", "we", "our", "you", "your", "he", "him", "his", "she", "her", "it", "its", "they", "them", "their"
  ]);
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (stopWords.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, count).map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function generateSummary(text: string) {
  if (!text || !text.trim()) {
    return {
      executiveSummary: "No readable text could be extracted from this document. You can still download and view the file directly.",
      keyPoints: ["Unable to extract document content"],
      importantTechnologies: [],
      importantDates: [],
      actionItems: [],
    };
  }
  const sentences = text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
  const top = sentences.slice(0, 5);
  const executiveSummary = top.join(" ").slice(0, 800) || "Summary generated from available document content.";
  const keyPoints = sentences.slice(0, 8).map((s) => s.trim().slice(0, 200)).filter(Boolean);
  if (keyPoints.length === 0) {
    keyPoints.push("Document content available for preview and download");
  }
  let importantTechnologies = extractKeywords(text, 12).filter((k) => /^(React|Next|Node|Prisma|TypeScript|JavaScript|Python|Java|Docker|Kubernetes|AWS|Azure|GCP|AI|ML|API|SQL|Postgres|Mongo|GraphQL|REST)$/i.test(k) || k.length > 4).slice(0, 8);
  if (importantTechnologies.length === 0) {
    importantTechnologies = extractKeywords(text, 6);
  }
  const importantDates = Array.from(new Set((text.match(/\b(19|20)\d{2}\b/g) || []).map((d) => d)));
  const actionItems = sentences.filter((s) => /must|should|need to|action|todo|complete|review|implement/i.test(s)).slice(0, 5).map((s) => s.trim().slice(0, 150));
  return {
    executiveSummary,
    keyPoints: keyPoints.slice(0, 6),
    importantTechnologies,
    importantDates: importantDates.slice(0, 5),
    actionItems,
  };
}

export function detectLanguage(text: string): string {
  const sample = text.slice(0, 500).toLowerCase();
  if (/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(sample)) return "Other";
  if (/[а-яё]/.test(sample)) return "Russian";
  if (/[一-龯]/.test(sample)) return "Chinese";
  if (/[ひらがなカタカナ]/.test(sample)) return "Japanese";
  if (/[가-힣]/.test(sample)) return "Korean";
  return "English";
}
