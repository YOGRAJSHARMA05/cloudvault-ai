"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { removeUserFile } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";
import type { FileActionResult } from "@/types/files";
import type { TrashContents, TrashedFileView, TrashedFolderView } from "@/types/trash";

import { createLogger } from "@/lib/logger";

const log = createLogger("actions:trash");

const fileIdSchema = z.object({ fileId: z.string().cuid() });
const folderIdSchema = z.object({ folderId: z.string().cuid() });
const fileIdsSchema = z.object({
  fileIds: z.array(z.string().cuid()).min(1).max(100),
});
const folderIdsSchema = z.object({
  folderIds: z.array(z.string().cuid()).min(1).max(100),
});

type TrashAction = FileActionResult;

function trashFailure(error: unknown): TrashAction {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { success: false, message: "A folder with that name already exists in the destination." };
  }
  log.error("Trash action failed", error);
  return { success: false, message: "Something went wrong. Please try again." };
}

function revalidateTrash() {
  revalidatePath("/dashboard");
  revalidatePath("/trash");
  revalidatePath("/analytics");
}

export async function getTrashContents(): Promise<TrashContents> {
  const user = await requireUser();
  const [files, folders, aggregate] = await Promise.all([
    prisma.file.findMany({
      where: { userId: user.id, deletedAt: { not: null } },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        extension: true,
        size: true,
        folder: true,
        deletedAt: true,
        createdAt: true,
        parentFolder: { select: { name: true } },
      },
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      take: 500,
    }),
    prisma.folder.findMany({
      where: { userId: user.id, deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        icon: true,
        parentFolderId: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { childFolders: true, files: true } },
      },
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      take: 500,
    }),
    prisma.file.aggregate({
      where: { userId: user.id, deletedAt: { not: null } },
      _sum: { size: true },
    }),
  ]);

  const trashedFolderIds = new Set(folders.map((folder) => folder.id));
  const trashFiles: TrashedFileView[] = files.map((file) => ({
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    extension: file.extension,
    size: file.size.toString(),
    folderName: file.parentFolder?.name ?? file.folder ?? "/",
    deletedAt: (file.deletedAt as Date).toISOString(),
    createdAt: file.createdAt.toISOString(),
  }));

  const trashFolders: TrashedFolderView[] = folders
    .filter(
      (folder) =>
        !folder.parentFolderId || !trashedFolderIds.has(folder.parentFolderId),
    )
    .map<TrashedFolderView>((folder) => ({
      id: folder.id,
      name: folder.name,
      slug: folder.slug,
      color: folder.color,
      icon: folder.icon,
      parentFolderId: folder.parentFolderId,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      deletedAt: (folder.deletedAt as Date).toISOString(),
      childCount: folder._count.childFolders,
      fileCount: folder._count.files,
    }));

  return {
    files: trashFiles,
    folders: trashFolders,
    totalBytes: (aggregate._sum.size ?? BigInt(0)).toString(),
  };
}

async function restoreFileForUser(userId: string, fileId: string): Promise<boolean> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId, deletedAt: { not: null } },
    select: {
      id: true,
      folderId: true,
      parentFolder: { select: { deletedAt: true } },
    },
  });
  if (!file) return false;

  const parentIsTrashed = Boolean(file.parentFolder?.deletedAt);
  await prisma.file.updateMany({
    where: { id: file.id, userId, deletedAt: { not: null } },
    data: parentIsTrashed
      ? { deletedAt: null, folderId: null, folder: "/" }
      : { deletedAt: null },
  });
  return true;
}

async function deleteFileForUser(userId: string, fileId: string): Promise<boolean> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId, deletedAt: { not: null } },
    select: { id: true, storedName: true },
  });
  if (!file) return false;

  await prisma.file.deleteMany({ where: { id: file.id, userId } });
  await removeUserFile(userId, file.storedName).catch((error: unknown) => {
    log.error("Failed to purge stored file bytes", error);
  });
  return true;
}

async function getTrashedFolderSubtree(
  userId: string,
  folderId: string,
): Promise<Array<{ id: string; depth: number }>> {
  return prisma.$queryRaw<Array<{ id: string; depth: number }>>`
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT "id", 0 FROM "Folder"
      WHERE "id" = ${folderId} AND "userId" = ${userId} AND "deletedAt" IS NOT NULL
      UNION ALL
      SELECT child."id", descendants.depth + 1
      FROM "Folder" child
      INNER JOIN descendants ON child."parentFolderId" = descendants."id"
      WHERE child."userId" = ${userId} AND child."deletedAt" IS NOT NULL
        AND descendants.depth < 100
    )
    SELECT id, depth FROM descendants ORDER BY depth DESC
  `;
}

async function restoreFolderForUser(userId: string, folderId: string): Promise<boolean> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId, deletedAt: { not: null } },
    select: {
      id: true,
      parentFolderId: true,
      parentFolder: { select: { deletedAt: true } },
    },
  });
  if (!folder) return false;

  const subtree = await getTrashedFolderSubtree(userId, folder.id);
  const folderIds = subtree.map((row) => row.id);
  const detachFromTrashedParent = Boolean(folder.parentFolder?.deletedAt);

  await prisma.$transaction([
    prisma.folder.updateMany({
      where: { id: { in: folderIds }, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    }),
    prisma.file.updateMany({
      where: { userId, folderId: { in: folderIds }, deletedAt: { not: null } },
      data: { deletedAt: null },
    }),
    ...(detachFromTrashedParent
      ? [
          prisma.folder.updateMany({
            where: { id: folder.id, userId },
            data: { parentFolderId: null, parentKey: "root" },
          }),
        ]
      : []),
  ]);
  return true;
}

async function deleteFolderForUser(userId: string, folderId: string): Promise<number> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (!folder) return 0;

  const subtree = await getTrashedFolderSubtree(userId, folder.id);
  const folderIds = subtree.map((row) => row.id);
  const files = await prisma.file.findMany({
    where: { userId, folderId: { in: folderIds } },
    select: { storedName: true },
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.file.updateMany({
      where: { userId, folderId: { in: folderIds }, deletedAt: null },
      data: { folderId: null, folder: "/" },
    });
    await transaction.file.deleteMany({
      where: { userId, folderId: { in: folderIds } },
    });
    for (const id of folderIds) {
      await transaction.folder.deleteMany({ where: { id, userId } });
    }
  });

  for (const file of files) {
    await removeUserFile(userId, file.storedName).catch((error: unknown) => {
      log.error("Failed to purge stored file bytes", error);
    });
  }
  return folderIds.length;
}

export async function restoreTrashedFile(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = fileIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid file." };

  try {
    if (!(await restoreFileForUser(user.id, parsed.data.fileId))) {
      return { success: false, message: "That file is not in the trash." };
    }
    revalidateTrash();
    return { success: true, message: "File restored." };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function restoreTrashedFolder(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = folderIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid folder." };

  try {
    if (!(await restoreFolderForUser(user.id, parsed.data.folderId))) {
      return { success: false, message: "That folder is not in the trash." };
    }
    revalidateTrash();
    return { success: true, message: "Folder and its contents restored." };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function permanentlyDeleteFile(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = fileIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid file." };

  try {
    if (!(await deleteFileForUser(user.id, parsed.data.fileId))) {
      return { success: false, message: "That file is not in the trash." };
    }
    revalidateTrash();
    return { success: true, message: "File permanently deleted." };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function permanentlyDeleteFolder(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = folderIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid folder." };

  try {
    if (!(await deleteFolderForUser(user.id, parsed.data.folderId))) {
      return { success: false, message: "That folder is not in the trash." };
    }
    revalidateTrash();
    return { success: true, message: "Folder permanently deleted." };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function restoreTrashedFiles(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = fileIdsSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Select files to restore." };

  try {
    let restored = 0;
    for (const fileId of parsed.data.fileIds) {
      if (await restoreFileForUser(user.id, fileId)) restored += 1;
    }
    revalidateTrash();
    return {
      success: true,
      message: `${restored} ${restored === 1 ? "file" : "files"} restored.`,
    };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function permanentlyDeleteFiles(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = fileIdsSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Select files to delete." };

  try {
    let deleted = 0;
    for (const fileId of parsed.data.fileIds) {
      if (await deleteFileForUser(user.id, fileId)) deleted += 1;
    }
    revalidateTrash();
    return {
      success: true,
      message: `${deleted} ${deleted === 1 ? "file" : "files"} permanently deleted.`,
    };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function restoreTrashedFolders(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = folderIdsSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Select folders to restore." };

  try {
    let restored = 0;
    for (const folderId of parsed.data.folderIds) {
      if (await restoreFolderForUser(user.id, folderId)) restored += 1;
    }
    revalidateTrash();
    return {
      success: true,
      message: `${restored} ${restored === 1 ? "folder" : "folders"} restored.`,
    };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function permanentlyDeleteFolders(input: unknown): Promise<TrashAction> {
  const user = await requireUser();
  const parsed = folderIdsSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Select folders to delete." };

  try {
    let deleted = 0;
    for (const folderId of parsed.data.folderIds) {
      deleted += (await deleteFolderForUser(user.id, folderId)) ? 1 : 0;
    }
    revalidateTrash();
    return {
      success: true,
      message: `${deleted} ${deleted === 1 ? "folder" : "folders"} permanently deleted.`,
    };
  } catch (error) {
    return trashFailure(error);
  }
}

export async function emptyTrash(): Promise<TrashAction> {
  const user = await requireUser();

  try {
    const [files, folders] = await Promise.all([
      prisma.file.findMany({
        where: { userId: user.id, deletedAt: { not: null } },
        select: { id: true, storedName: true },
      }),
      prisma.folder.findMany({
        where: { userId: user.id, deletedAt: { not: null } },
        select: { id: true },
      }),
    ]);

    if (!files.length && !folders.length) {
      return { success: true, message: "Trash is already empty." };
    }

    const folderIds = folders.map((folder) => folder.id);
    const orderedFolders = await prisma.$queryRaw<Array<{ id: string; depth: number }>>`
      WITH RECURSIVE tree(id, depth) AS (
        SELECT "id", 0 FROM "Folder" WHERE "userId" = ${user.id} AND "deletedAt" IS NOT NULL
        UNION ALL
        SELECT child."id", tree.depth + 1
        FROM "Folder" child
        INNER JOIN tree ON child."parentFolderId" = tree."id"
        WHERE child."userId" = ${user.id} AND tree.depth < 100
      )
      SELECT id, depth FROM tree ORDER BY depth DESC
    `;

    await prisma.$transaction(async (transaction) => {
      if (folderIds.length) {
        await transaction.file.updateMany({
          where: {
            userId: user.id,
            folderId: { in: folderIds },
            deletedAt: null,
          },
          data: { folderId: null, folder: "/" },
        });
        await transaction.file.deleteMany({
          where: { userId: user.id, folderId: { in: folderIds } },
        });
      }
      await transaction.file.deleteMany({
        where: { userId: user.id, deletedAt: { not: null } },
      });
      for (const folder of orderedFolders) {
        await transaction.folder.deleteMany({
          where: { id: folder.id, userId: user.id },
        });
      }
    });

    for (const file of files) {
      await removeUserFile(user.id, file.storedName).catch((error: unknown) => {
        log.error("Failed to purge stored file bytes", error);
      });
    }

    revalidateTrash();
    return {
      success: true,
      message: `Trash emptied. ${files.length} ${files.length === 1 ? "file" : "files"} permanently deleted.`,
    };
  } catch (error) {
    return trashFailure(error);
  }
}
