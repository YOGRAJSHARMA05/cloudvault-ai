"use server";

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import type { FileActionResult } from "@/types/files";
import type {
  CreatedShareLink,
  ShareFileOption,
  ShareLinkStatus,
  ShareLinkView,
} from "@/types/share";

import { createLogger } from "@/lib/logger";

const log = createLogger("actions:share");

const createShareLinkSchema = z.object({
  fileId: z.string().cuid(),
  label: z.string().trim().max(80).optional().default(""),
  expiresInDays: z.number().int().min(0).max(365).optional().default(7),
  maxViews: z.number().int().min(1).max(100_000).nullable().optional(),
  password: z
    .string()
    .max(128)
    .optional()
    .default("")
    .refine((value) => value.length === 0 || value.length >= 4, {
      message: "Share passwords must be at least 4 characters.",
    }),
});

const shareLinkIdSchema = z.object({ id: z.string().cuid() });

function shareStatus(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxViews: number | null;
  viewCount: number;
  file: { deletedAt: Date | null } | null;
}): ShareLinkStatus {
  if (!link.file || link.file.deletedAt) return "file-missing";
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return "expired";
  if (link.maxViews !== null && link.viewCount >= link.maxViews) return "exhausted";
  return "active";
}

export async function getShareFileOptions(): Promise<ShareFileOption[]> {
  const user = await requireUser();
  const files = await prisma.file.findMany({
    where: { userId: user.id, deletedAt: null },
    select: { id: true, originalName: true, extension: true, size: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 250,
  });
  return files.map((file) => ({
    id: file.id,
    originalName: file.originalName,
    extension: file.extension,
    size: file.size.toString(),
  }));
}

export async function listShareLinks(): Promise<ShareLinkView[]> {
  const user = await requireUser();
  const links = await prisma.shareLink.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      token: true,
      label: true,
      fileId: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      maxViews: true,
      viewCount: true,
      passwordHash: true,
      file: {
        select: {
          originalName: true,
          extension: true,
          size: true,
          deletedAt: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return links.map((link) => ({
    id: link.id,
    token: link.token,
    label: link.label,
    fileId: link.fileId,
    fileName: link.file?.originalName ?? "Deleted file",
    fileExtension: link.file?.extension ?? "",
    fileSize: link.file?.size.toString() ?? "0",
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    maxViews: link.maxViews,
    viewCount: link.viewCount,
    passwordProtected: Boolean(link.passwordHash),
    status: shareStatus(link),
  }));
}

export async function createShareLink(
  input: unknown,
): Promise<FileActionResult<CreatedShareLink>> {
  const user = await requireUser();
  const parsed = createShareLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Check the share link details.",
    };
  }

  const { fileId, label, expiresInDays, maxViews, password } = parsed.data;
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!file) return { success: false, message: "That file could not be found." };

  try {
    const token = randomBytes(24).toString("base64url");
    const expiresAt =
      expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;
    const link = await prisma.shareLink.create({
      data: {
        fileId,
        userId: user.id,
        token,
        label: label || null,
        passwordHash: password ? await hash(password, 10) : null,
        expiresAt,
        maxViews: maxViews ?? null,
      },
      select: { id: true, token: true },
    });
    revalidatePath("/share");
    return {
      success: true,
      message: "Share link created.",
      data: {
        id: link.id,
        token: link.token,
        path: `/share/${link.token}`,
      },
    };
  } catch (error) {
    log.error("Failed to create share link", error);
    return { success: false, message: "Could not create the share link." };
  }
}

export async function revokeShareLink(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = shareLinkIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid share link." };

  try {
    const result = await prisma.shareLink.updateMany({
      where: { id: parsed.data.id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) {
      return { success: false, message: "That share link is already disabled." };
    }
    revalidatePath("/share");
    return { success: true, message: "Share link disabled." };
  } catch (error) {
    log.error("Failed to revoke share link", error);
    return { success: false, message: "Could not disable the share link." };
  }
}

export async function deleteShareLink(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = shareLinkIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid share link." };

  try {
    const result = await prisma.shareLink.deleteMany({
      where: { id: parsed.data.id, userId: user.id },
    });
    if (!result.count) return { success: false, message: "That share link could not be found." };
    revalidatePath("/share");
    return { success: true, message: "Share link deleted." };
  } catch (error) {
    log.error("Failed to delete share link", error);
    return { success: false, message: "Could not delete the share link." };
  }
}
