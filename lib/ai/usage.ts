import "server-only";

import {
  getAiConfig,
  getChatProviderConfig,
  getEmbeddingTarget,
  providerLabel,
} from "@/lib/ai/config";
import { prisma } from "@/lib/prisma";
import type { AiUsageSummary, ChatUsage } from "@/types/ai";

import { createLogger } from "@/lib/logger";

const log = createLogger("ai:usage");

function dayWindow(now = new Date()): { start: Date; resetAt: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const resetAt = new Date(start);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  return { start, resetAt };
}

export async function getAiUsage(userId: string): Promise<ChatUsage> {
  const { start, resetAt } = dayWindow();
  const used = await prisma.aiUsage.count({
    where: { userId, createdAt: { gte: start } },
  });
  const limit = getAiConfig().dailyRequestLimit;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: resetAt.toISOString(),
  };
}

export async function beginAiRequest(
  userId: string,
  kind: string,
): Promise<{ allowed: boolean; usage: ChatUsage; recordId: string | null }> {
  const usage = await getAiUsage(userId);
  if (usage.used >= usage.limit) {
    return { allowed: false, usage, recordId: null };
  }

  const chat = getChatProviderConfig();
  const embedding = getEmbeddingTarget();
  const provider = chat.provider === "local" ? embedding.provider : chat.provider;
  const model = chat.provider === "local" ? embedding.model : chat.model;

  try {
    const record = await prisma.aiUsage.create({
      data: { userId, kind, provider, model },
      select: { id: true },
    });
    return {
      allowed: true,
      usage: {
        ...usage,
        used: usage.used + 1,
        remaining: Math.max(0, usage.limit - usage.used - 1),
      },
      recordId: record.id,
    };
  } catch (error) {
    log.error("Failed to record AI usage", error);
    // Usage accounting must never block a valid request.
    return { allowed: true, usage, recordId: null };
  }
}

export async function finishAiRequest(
  recordId: string | null,
  tokens: { inputTokens: number; outputTokens: number } | null,
): Promise<void> {
  if (!recordId) return;
  try {
    await prisma.aiUsage.update({
      where: { id: recordId },
      data: {
        inputTokens: Math.max(0, Math.floor(tokens?.inputTokens ?? 0)),
        outputTokens: Math.max(0, Math.floor(tokens?.outputTokens ?? 0)),
      },
    });
  } catch (error) {
    log.error("Failed to finalize AI usage", error);
  }
}

export async function getAiUsageSummary(
  userId: string,
): Promise<AiUsageSummary> {
  const usage = await getAiUsage(userId);
  const chat = getChatProviderConfig();
  const embedding = getEmbeddingTarget();
  const provider = chat.provider === "local" ? embedding.provider : chat.provider;
  return {
    ...usage,
    provider: provider === "local" ? "local" : `${providerLabel(provider)} embedding`,
    providerLabel: providerLabel(chat.provider),
    model: chat.provider === "local" ? embedding.model : chat.model,
    local: chat.provider === "local",
  };
}
