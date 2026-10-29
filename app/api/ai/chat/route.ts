import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getAiConfig } from "@/lib/ai/config";
import { buildChatSystemPrompt, buildLocalAnswer, estimateTokens, preparePromptSources, titleFromQuestion, toCitations } from "@/lib/ai/prompt";
import { streamProviderAnswer, type ProviderMessage } from "@/lib/ai/provider";
import { retrieveRelevantSources } from "@/lib/ai/rag";
import { beginAiRequest, finishAiRequest } from "@/lib/ai/usage";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/security/http";
import type { AiCitation, ChatMessageView, ChatStreamEvent } from "@/types/ai";
import type { Prisma } from "@prisma/client";

import { createLogger } from "@/lib/logger";

const log = createLogger("api:ai:chat");

const postSchema = z.object({
  question: z.string().trim().min(2).max(2_000),
  fileId: z.string().cuid().optional(),
  threadId: z.string().cuid().optional(),
});

const patchSchema = z.object({
  threadId: z.string().cuid(),
  title: z.string().trim().min(1).max(80),
});

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

function citationList(value: Prisma.JsonValue | null): AiCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Prisma.JsonObject =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    )
    .map((entry, position) => ({
      index: typeof entry.index === "number" ? entry.index : position + 1,
      fileId: typeof entry.fileId === "string" ? entry.fileId : "",
      fileName: typeof entry.fileName === "string" ? entry.fileName : "",
      extension: typeof entry.extension === "string" ? entry.extension : "",
      section: typeof entry.section === "string" ? entry.section : "",
      chunkIndex: typeof entry.chunkIndex === "number" ? entry.chunkIndex : 0,
      excerpt: typeof entry.excerpt === "string" ? entry.excerpt : "",
      score: typeof entry.score === "number" ? entry.score : 0,
    }));
}

// ---------------------------------------------------------------------------
// GET: thread list or a single thread with its messages
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Authentication required.", 401);

  const url = new URL(request.url);
  const threadId = url.searchParams.get("threadId");
  const fileId = url.searchParams.get("fileId");

  try {
    if (threadId) {
      const thread = await prisma.chatThread.findFirst({
        where: { id: threadId, userId: session.user.id },
        select: {
          id: true,
          title: true,
          fileId: true,
          updatedAt: true,
          file: { select: { originalName: true } },
        },
      });
      if (!thread) return jsonError("Chat not found.", 404);

      const messages = await prisma.chatMessage.findMany({
        where: { threadId: thread.id, userId: session.user.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          role: true,
          content: true,
          citations: true,
          model: true,
          createdAt: true,
        },
      });

      const view: ChatMessageView[] = messages.map((message) => ({
        id: message.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        citations: citationList(message.citations),
        model: message.model,
        createdAt: message.createdAt.toISOString(),
      }));

      return NextResponse.json({
        thread: {
          id: thread.id,
          title: thread.title,
          fileId: thread.fileId,
          fileName: thread.file?.originalName ?? null,
          updatedAt: thread.updatedAt.toISOString(),
        },
        messages: view,
      });
    }

    const threads = await prisma.chatThread.findMany({
      where: {
        userId: session.user.id,
        ...(fileId ? { fileId } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        fileId: true,
        updatedAt: true,
        file: { select: { originalName: true } },
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({
      threads: threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        fileId: thread.fileId,
        fileName: thread.file?.originalName ?? null,
        messageCount: thread._count.messages,
        updatedAt: thread.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    log.error("Failed to load chat history", error);
    return jsonError("Could not load chat history.", 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH: rename a thread
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Authentication required.", 401);

  const limited = await applyRateLimit(request, `ai:chat:patch:${session.user.id}`, 40);
  if (limited) return limited;

  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError("Invalid request.", 400);

    const updated = await prisma.chatThread.updateMany({
      where: { id: parsed.data.threadId, userId: session.user.id },
      data: { title: parsed.data.title },
    });
    if (!updated.count) return jsonError("Chat not found.", 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to rename chat", error);
    return jsonError("Could not rename this chat.", 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE: remove a thread (messages cascade)
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Authentication required.", 401);

  const limited = await applyRateLimit(request, `ai:chat:delete:${session.user.id}`, 40);
  if (limited) return limited;

  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!threadId) return jsonError("Missing chat id.", 400);

  try {
    const deleted = await prisma.chatThread.deleteMany({
      where: { id: threadId, userId: session.user.id },
    });
    if (!deleted.count) return jsonError("Chat not found.", 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete chat", error);
    return jsonError("Could not delete this chat.", 500);
  }
}

// ---------------------------------------------------------------------------
// POST: ask a question and stream the answer as Server-Sent Events
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Authentication required.", 401);
  const userId = session.user.id;

  const limited = await applyRateLimit(request, `ai:chat:${userId}`, 15);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request.", 400);

  const { question, fileId } = parsed.data;

  // A thread is always scoped to a single document, or to the workspace.
  let thread = parsed.data.threadId
    ? await prisma.chatThread.findFirst({
        where: { id: parsed.data.threadId, userId },
        select: { id: true, title: true, fileId: true },
      })
    : null;

  if (parsed.data.threadId && !thread) {
    return jsonError("Chat not found.", 404);
  }

  if (!thread) {
    if (fileId) {
      const owned = await prisma.file.findFirst({
        where: { id: fileId, userId, deletedAt: null },
        select: { id: true },
      });
      if (!owned) return jsonError("File not found.", 404);
    }
    thread = await prisma.chatThread.create({
      data: {
        userId,
        fileId: fileId ?? null,
        title: titleFromQuestion(question),
      },
      select: { id: true, title: true, fileId: true },
    });
  }

  const scopeFileId = thread.fileId ?? undefined;

  const started = await beginAiRequest(userId, "chat");
  if (!started.allowed) {
    return jsonError("Daily AI limit reached. It resets at midnight UTC.", 429, {
      usage: started.usage,
      code: "limit_reached",
    });
  }

  try {
    await prisma.chatMessage.create({
      data: { threadId: thread.id, userId, role: "user", content: question },
    });
  } catch (error) {
    log.error("Failed to save chat question", error);
  }

  const sources = await retrieveRelevantSources(userId, question, {
    fileId: scopeFileId,
    limit: 6,
  }).catch((error) => {
    log.error("Retrieval failed for chat", error);
    return [];
  });

  const prepared = preparePromptSources(sources, getAiConfig().maxContextChars);
  const citations = toCitations(prepared);

  const history = await prisma.chatMessage
    .findMany({
      where: { threadId: thread.id, userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 9,
      select: { role: true, content: true },
    })
    .catch(() => [])
    .then((rows) => rows.reverse());

  const historyMessages: ProviderMessage[] = history
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content.slice(0, 4_000),
    }));

  const messages: ProviderMessage[] = [
    { role: "system", content: buildChatSystemPrompt(prepared) },
    ...historyMessages,
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      function send(event: ChatStreamEvent) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      }
      function close() {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }

      const provider = await streamProviderAnswer(messages, request.signal);
      send({
        type: "meta",
        threadId: thread.id,
        provider: provider?.provider ?? "local",
        model: provider?.model ?? "local-extractive-v1",
        local: !provider,
        citations,
        usage: started.usage,
      });

      let answer = "";
      let usedProvider = false;
      let model = provider?.model ?? "local-extractive-v1";

      try {
        if (provider) {
          for await (const delta of provider.stream) {
            if (request.signal.aborted) break;
            usedProvider = true;
            answer += delta;
            send({ type: "delta", text: delta });
          }
        }

        if (!answer.trim()) {
          usedProvider = false;
          model = "local-extractive-v1";
          const local = buildLocalAnswer(question, prepared);
          for (const piece of local.match(/[\s\S]{1,90}/g) ?? [local]) {
            if (request.signal.aborted) break;
            answer += piece;
            send({ type: "delta", text: piece });
            // Small await keeps the stream responsive without adding latency.
            await Promise.resolve();
          }
        }
      } catch (error) {
        log.error("Chat streaming failed", error);
        if (!answer.trim()) {
          usedProvider = false;
          model = "local-extractive-v1";
          answer = buildLocalAnswer(question, prepared);
          send({ type: "delta", text: answer });
        } else {
          const suffix = "\n\n_The response was interrupted before it finished._";
          answer += suffix;
          send({ type: "delta", text: suffix });
        }
      }

      const finalUsage = started.usage;

      // The client disconnected before any content arrived; don't persist an
      // empty assistant message.
      if (!answer.trim()) {
        await finishAiRequest(started.recordId, null);
        close();
        return;
      }

      try {
        const saved = await prisma.chatMessage.create({
          data: {
            threadId: thread.id,
            userId,
            role: "assistant",
            content: answer.slice(0, 30_000),
            citations: citations as unknown as Prisma.InputJsonValue,
            model: usedProvider ? model : "local-extractive-v1",
          },
          select: { id: true },
        });

        await prisma.chatThread.update({
          where: { id: thread.id },
          data: {
            updatedAt: new Date(),
            ...(thread.title === "New chat" ? { title: titleFromQuestion(question) } : {}),
          },
        });

        send({ type: "done", messageId: saved.id, usage: finalUsage });
      } catch (error) {
        log.error("Failed to save chat answer", error);
        send({ type: "error", error: "The answer could not be saved.", code: "save_failed" });
      }

      await finishAiRequest(started.recordId, {
        inputTokens: estimateTokens(messages.map((message) => message.content).join("\n")),
        outputTokens: estimateTokens(answer),
      });

      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
