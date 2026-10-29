export type AiProviderName = "openai" | "gemini" | "local";

export type ChatProviderConfig = {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type EmbeddingTarget = {
  provider: AiProviderName;
  model: string;
  dimensions: number;
};

export type AiConfig = {
  chat: ChatProviderConfig;
  embedding: EmbeddingTarget;
  dailyRequestLimit: number;
  maxContextChars: number;
  maxOutputTokens: number;
  temperature: number;
};

export const LOCAL_EMBEDDING_MODEL = "hashed-tfidf-v1";
export const LOCAL_EMBEDDING_DIMENSIONS = 256;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function positiveInt(name: string, fallback: number): number {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function numeric(name: string, fallback: number): number {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOpenAiKey(): string {
  return env("OPENAI_API_KEY");
}

export function getGeminiKey(): string {
  return env("GEMINI_API_KEY") || env("GOOGLE_GENERATIVE_AI_API_KEY") || env("GOOGLE_API_KEY");
}

function resolveProvider(
  requested: string,
  openAiKey: string,
  geminiKey: string,
): AiProviderName {
  switch (requested.toLowerCase()) {
    case "openai":
      return openAiKey ? "openai" : "local";
    case "gemini":
    case "google":
      return geminiKey ? "gemini" : "local";
    case "local":
      return "local";
    default:
      if (openAiKey) return "openai";
      if (geminiKey) return "gemini";
      return "local";
  }
}

export function resolveChatProvider(): AiProviderName {
  return resolveProvider(env("AI_PROVIDER") || "auto", getOpenAiKey(), getGeminiKey());
}

export function getChatProviderConfig(): ChatProviderConfig {
  const provider = resolveChatProvider();
  if (provider === "openai") {
    return {
      provider,
      model: env("OPENAI_CHAT_MODEL") || "gpt-4o-mini",
      apiKey: getOpenAiKey(),
      baseUrl: (env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, ""),
    };
  }
  if (provider === "gemini") {
    return {
      provider,
      model: env("GEMINI_CHAT_MODEL") || "gemini-2.0-flash",
      apiKey: getGeminiKey(),
      baseUrl: (env("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, ""),
    };
  }
  return { provider: "local", model: "local-extractive-v1", apiKey: "", baseUrl: "" };
}

export function resolveEmbeddingProvider(): AiProviderName {
  const requested = env("AI_EMBEDDING_PROVIDER") || "auto";
  if (requested.toLowerCase() === "auto") {
    return getChatProviderConfig().provider;
  }
  return resolveProvider(requested, getOpenAiKey(), getGeminiKey());
}

function defaultEmbeddingModel(provider: AiProviderName): string {
  if (provider === "openai") return env("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";
  if (provider === "gemini") return env("GEMINI_EMBEDDING_MODEL") || "text-embedding-004";
  return LOCAL_EMBEDDING_MODEL;
}

function defaultEmbeddingDimensions(provider: AiProviderName, model: string): number {
  const override = positiveInt("AI_EMBEDDING_DIMENSIONS", 0);
  if (override) return override;
  if (provider === "openai") {
    return model.includes("large") ? 3072 : 1536;
  }
  if (provider === "gemini") {
    return model.includes("gemini-embedding-001") ? 3072 : 768;
  }
  return LOCAL_EMBEDDING_DIMENSIONS;
}

export function getEmbeddingTarget(): EmbeddingTarget {
  const provider = resolveEmbeddingProvider();
  const model = defaultEmbeddingModel(provider);
  return {
    provider,
    model,
    dimensions: defaultEmbeddingDimensions(provider, model),
  };
}

export function getAiConfig(): AiConfig {
  const chat = getChatProviderConfig();
  return {
    chat,
    embedding: getEmbeddingTarget(),
    dailyRequestLimit: positiveInt("AI_DAILY_REQUEST_LIMIT", 120),
    maxContextChars: positiveInt("AI_MAX_CONTEXT_CHARS", 14_000),
    maxOutputTokens: positiveInt("AI_MAX_OUTPUT_TOKENS", 900),
    temperature: numeric("AI_TEMPERATURE", 0.2),
  };
}

export function isProviderConfigured(): boolean {
  return getChatProviderConfig().provider !== "local";
}

export function providerLabel(provider: AiProviderName): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Google Gemini";
  return "Local fallback";
}
