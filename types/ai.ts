export type AiCitation = {
  index: number;
  fileId: string;
  fileName: string;
  extension: string;
  section: string;
  chunkIndex: number;
  excerpt: string;
  score: number;
};

export type ChatRole = "user" | "assistant";

export type ChatMessageView = {
  id: string;
  role: ChatRole;
  content: string;
  citations: AiCitation[];
  model: string | null;
  createdAt: string;
};

export type ChatThreadView = {
  id: string;
  title: string;
  fileId: string | null;
  fileName: string | null;
  messageCount: number;
  updatedAt: string;
};

export type ChatFileOption = {
  id: string;
  originalName: string;
  extension: string;
};

export type ChatUsage = {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

export type AiUsageSummary = ChatUsage & {
  provider: string;
  providerLabel: string;
  model: string;
  local: boolean;
};

export type ChatStreamEvent =
  | {
      type: "meta";
      threadId: string;
      provider: string;
      model: string;
      local: boolean;
      citations: AiCitation[];
      usage: ChatUsage;
    }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; usage: ChatUsage }
  | { type: "error"; error: string; code?: string };

export type SimilarDocumentView = {
  id: string;
  originalName: string;
  extension: string;
  size: string;
  folderName: string;
  updatedAt: string;
  score: number;
  sharedTags: string[];
};

export type FileTagView = {
  id: string;
  name: string;
  category: string;
  confidence: number;
  source: string;
};
