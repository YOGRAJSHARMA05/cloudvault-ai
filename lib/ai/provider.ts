import "server-only";

import {
  getAiConfig,
  getChatProviderConfig,
  getEmbeddingTarget,
  type AiProviderName,
} from "@/lib/ai/config";

import { createLogger } from "@/lib/logger";

const log = createLogger("ai:provider");

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderStream = {
  provider: AiProviderName;
  model: string;
  stream: AsyncGenerator<string>;
};

export type ProviderCompletion = {
  text: string;
  provider: AiProviderName;
  model: string;
};

export type ProviderEmbeddings = {
  vectors: number[][];
  provider: AiProviderName;
  model: string;
  dimensions: number;
};

type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const EMBEDDING_COOLDOWN_MS = 60_000;
const CHAT_COOLDOWN_MS = 60_000;

let embeddingCooldownUntil = 0;
let chatCooldownUntil = 0;

export class AiProviderError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
  }
}

function timeoutSignal(signal: AbortSignal | undefined, ms = 60_000): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function* readSseData(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        for (const line of rawEvent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload) yield payload;
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function describeError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return `Provider request failed with status ${response.status}.`;
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // Fall through to a truncated plain-text message.
  }
  return text.slice(0, 300);
}

async function openAiStream(
  messages: ProviderMessage[],
  signal: AbortSignal | undefined,
): Promise<ProviderStream> {
  const config = getChatProviderConfig();
  const aiConfig = getAiConfig();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxOutputTokens,
    }),
    signal: timeoutSignal(signal),
      cache: "no-store",
  });

  if (!response.ok) {
    throw new AiProviderError(await describeError(response), response.status);
  }

  async function* generate(): AsyncGenerator<string> {
    for await (const payload of readSseData(response)) {
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // Ignore keep-alive or non-JSON frames.
      }
    }
  }

  return { provider: "openai", model: config.model, stream: generate() };
}

async function geminiStream(
  messages: ProviderMessage[],
  signal: AbortSignal | undefined,
): Promise<ProviderStream> {
  const config = getChatProviderConfig();
  const aiConfig = getAiConfig();
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        temperature: aiConfig.temperature,
        maxOutputTokens: aiConfig.maxOutputTokens,
      },
    }),
    signal: timeoutSignal(signal),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new AiProviderError(await describeError(response), response.status);
  }

  async function* generate(): AsyncGenerator<string> {
    for await (const payload of readSseData(response)) {
      try {
        const parsed = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (typeof part.text === "string" && part.text) yield part.text;
        }
      } catch {
        // Ignore non-JSON frames.
      }
    }
  }

  return { provider: "gemini", model: config.model, stream: generate() };
}

/**
 * Opens a streaming provider response. Returns null when no provider key is
 * configured (or a recent provider failure is cooling down), so callers can
 * fall back to the local extractive answer.
 */
export async function streamProviderAnswer(
  messages: ProviderMessage[],
  signal?: AbortSignal,
): Promise<ProviderStream | null> {
  const config = getChatProviderConfig();
  if (config.provider === "local") return null;
  if (chatCooldownUntil > Date.now()) return null;

  try {
    return config.provider === "openai"
      ? await openAiStream(messages, signal)
      : await geminiStream(messages, signal);
  } catch (error) {
    chatCooldownUntil = Date.now() + CHAT_COOLDOWN_MS;
    log.error("AI provider streaming failed; using local fallback", error);
    return null;
  }
}

export async function completeProviderText({
  system,
  prompt,
  signal,
}: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<ProviderCompletion | null> {
  const config = getChatProviderConfig();
  if (config.provider === "local") return null;

  const aiConfig = getAiConfig();
  const maxTokens = aiConfig.maxOutputTokens;
  const temperature = aiConfig.temperature;

  try {
    if (config.provider === "openai") {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
        signal: timeoutSignal(signal),
        cache: "no-store",
      });
      if (!response.ok) throw new AiProviderError(await describeError(response), response.status);
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return null;
      return { text, provider: "openai", model: config.model };
    }

    const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
      signal: timeoutSignal(signal),
      cache: "no-store",
    });
    if (!response.ok) throw new AiProviderError(await describeError(response), response.status);
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) return null;
    return { text, provider: "gemini", model: config.model };
  } catch (error) {
    log.error("AI provider completion failed; using local fallback", error);
    return null;
  }
}

async function openAiEmbeddings(
  texts: string[],
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += 64) {
    const batch = texts.slice(index, index + 64);
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: batch }),
      signal: timeoutSignal(undefined, 90_000),
      cache: "no-store",
    });
    if (!response.ok) throw new AiProviderError(await describeError(response), response.status);
    const data = (await response.json()) as {
      data?: Array<{ index?: number; embedding?: number[] }>;
    };
    const ordered = [...(data.data ?? [])].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    for (const item of ordered) {
      if (!Array.isArray(item.embedding)) {
        throw new AiProviderError("Embedding provider returned an invalid vector.");
      }
      vectors.push(item.embedding);
    }
  }
  return vectors;
}

async function geminiEmbeddings(
  texts: string[],
  model: string,
  apiKey: string,
  baseUrl: string,
  taskType: EmbeddingTask,
): Promise<number[][]> {
  const override = Number.parseInt(process.env.AI_EMBEDDING_DIMENSIONS ?? "", 10);
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += 100) {
    const batch = texts.slice(index, index + 100);
    const response = await fetch(
      `${baseUrl}/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType,
            ...(override > 0 ? { outputDimensionality: override } : {}),
          })),
        }),
        signal: timeoutSignal(undefined, 90_000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new AiProviderError(await describeError(response), response.status);
    const data = (await response.json()) as {
      embeddings?: Array<{ values?: number[] }>;
    };
    for (const item of data.embeddings ?? []) {
      if (!Array.isArray(item.values)) {
        throw new AiProviderError("Embedding provider returned an invalid vector.");
      }
      vectors.push(item.values);
    }
  }
  return vectors;
}

/**
 * Produces provider embeddings when configured. Returns null on missing keys,
 * invalid payloads, or provider errors so callers can use local embeddings.
 */
export async function embedWithProvider(
  texts: string[],
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT",
): Promise<ProviderEmbeddings | null> {
  if (!texts.length) return null;
  const target = getEmbeddingTarget();
  if (target.provider === "local") return null;
  if (embeddingCooldownUntil > Date.now()) return null;

  try {
    let vectors: number[][];
    if (target.provider === "openai") {
      vectors = await openAiEmbeddings(
        texts,
        target.model,
        process.env.OPENAI_API_KEY ?? "",
        (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
      );
    } else {
      const apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        "";
      vectors = await geminiEmbeddings(
        texts,
        target.model,
        apiKey,
        (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, ""),
        taskType,
      );
    }

    if (vectors.length !== texts.length) {
      throw new AiProviderError("Embedding provider returned an unexpected number of vectors.");
    }
    const dimensions = vectors[0]?.length ?? 0;
    if (!dimensions || vectors.some((vector) => vector.length !== dimensions)) {
      throw new AiProviderError("Embedding provider returned inconsistent vector dimensions.");
    }

    return {
      vectors,
      provider: target.provider,
      model: target.model,
      dimensions,
    };
  } catch (error) {
    embeddingCooldownUntil = Date.now() + EMBEDDING_COOLDOWN_MS;
    log.error("AI embedding provider failed; using local embeddings", error);
    return null;
  }
}
