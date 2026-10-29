"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { FILE_PAGE_SIZE, type FileSort } from "@/constants/files";
import { ALLOWED_FILE_TYPES } from "@/constants/files";
import { requireUser } from "@/lib/auth-guard";
import { createFolderSlug, createFolderSchema, folderContentsSchema, folderIdSchema, moveFileSchema, moveFolderSchema, renameFolderSchema, workspaceSearchSchema } from "@/lib/folder-validation";
import { getFilePageOffset } from "@/lib/file-validation";
import { prisma } from "@/lib/prisma";
import type { FileRecordView } from "@/types/files";
import type { FolderBreadcrumb, FolderContents, FolderTreeNode, FolderView, WorkspaceSearchResults } from "@/types/folders";

import { createLogger } from "@/lib/logger";

const log = createLogger("actions:folders");

const folderSelect = {
  id: true,
  name: true,
  slug: true,
  color: true,
  icon: true,
  parentFolderId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { childFolders: true, files: true } },
} satisfies Prisma.FolderSelect;

const fileSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  extension: true,
  size: true,
  folder: true,
  isFavorite: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FileSelect;

function toFolderView(folder: Prisma.FolderGetPayload<{ select: typeof folderSelect }>): FolderView {
  return {
    id: folder.id,
    name: folder.name,
    slug: folder.slug,
    color: folder.color,
    icon: folder.icon,
    parentFolderId: folder.parentFolderId,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
    childCount: folder._count.childFolders,
    fileCount: folder._count.files,
  };
}

function toFileRecord(file: Prisma.FileGetPayload<{ select: typeof fileSelect }>): FileRecordView {
  return {
    ...file,
    size: file.size.toString(),
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

function actionFailure(error: unknown): { success: false; message: string } {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { success: false, message: "A folder with that name already exists here." };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return { success: false, message: "That folder could not be found." };
  }
  log.error("Folder management action failed", error);
  return { success: false, message: "Something went wrong. Please try again." };
}

function orderByForFiles(sort: FileSort): Prisma.FileOrderByWithRelationInput[] {
  const sortOptions = {
    newest: [{ createdAt: "desc" }, { id: "desc" }],
    oldest: [{ createdAt: "asc" }, { id: "asc" }],
    largest: [{ size: "desc" }, { createdAt: "desc" }],
    smallest: [{ size: "asc" }, { createdAt: "desc" }],
    "name-asc": [{ originalName: "asc" }, { id: "asc" }],
    "name-desc": [{ originalName: "desc" }, { id: "desc" }],
  } satisfies Record<FileSort, Prisma.FileOrderByWithRelationInput[]>;
  return sortOptions[sort];
}

function revalidateFolderViews(): void {
  revalidatePath("/dashboard");
}

export async function createFolder(input: unknown): Promise<{ success: boolean; message: string; folder?: FolderView }> {
  const user = await requireUser();
  const parsed = createFolderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Enter a valid folder name." };
  }

  const { name, parentFolderId, color, icon } = parsed.data;
  if (parentFolderId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentFolderId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) return { success: false, message: "Parent folder not found." };
  }

  const slug = createFolderSlug(name);
  if (!slug) return { success: false, message: "Enter a folder name containing letters or numbers." };

  try {
    const folder = await prisma.folder.create({
      data: {
        name,
        slug,
        color,
        icon,
        parentFolderId,
        parentKey: parentFolderId ?? "root",
        userId: user.id,
      },
      select: folderSelect,
    });
    revalidateFolderViews();
    return { success: true, message: "Folder created.", folder: toFolderView(folder) };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function renameFolder(input: unknown): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();
  const parsed = renameFolderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Enter a valid folder name." };
  }
  const folder = await prisma.folder.findFirst({
    where: { id: parsed.data.folderId, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!folder) return { success: false, message: "That folder could not be found." };

  const slug = createFolderSlug(parsed.data.name);
  if (!slug) return { success: false, message: "Enter a folder name containing letters or numbers." };

  try {
    await prisma.$transaction(async (transaction) => {
      const changed = await transaction.folder.updateMany({
        where: { id: parsed.data.folderId, userId: user.id, deletedAt: null },
        data: { name: parsed.data.name, slug },
      });
      if (!changed.count) throw new Error("Folder ownership changed during rename.");
    });
    revalidateFolderViews();
    return { success: true, message: "Folder renamed." };
  } catch (error) {
    return actionFailure(error);
  }
}

async function getActiveFolderSubtree(
  userId: string,
  folderId: string,
): Promise<Array<{ id: string; depth: number }>> {
  return prisma.$queryRaw<Array<{ id: string; depth: number }>>`
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT "id", 0 FROM "Folder"
      WHERE "id" = ${folderId} AND "userId" = ${userId} AND "deletedAt" IS NULL
      UNION ALL
      SELECT child."id", descendants.depth + 1
      FROM "Folder" child
      INNER JOIN descendants ON child."parentFolderId" = descendants."id"
      WHERE child."userId" = ${userId} AND descendants.depth < 100
    )
    SELECT id, depth FROM descendants ORDER BY depth DESC
  `;
}

/**
 * Moves a folder and everything inside it to the trash. Restoring the folder
 * from /trash restores its descendant folders and files as well.
 */
export async function deleteFolder(input: unknown): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();
  const parsed = folderIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid folder." };

  try {
    const folder = await prisma.folder.findFirst({
      where: { id: parsed.data, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!folder) return { success: false, message: "That folder could not be found." };

    const subtree = await getActiveFolderSubtree(user.id, folder.id);
    const folderIds = subtree.map((row) => row.id);
    if (!folderIds.length) {
      return { success: false, message: "That folder could not be found." };
    }

    const deletedAt = new Date();
    await prisma.$transaction([
      prisma.folder.updateMany({
        where: { id: { in: folderIds }, userId: user.id, deletedAt: null },
        data: { deletedAt },
      }),
      prisma.file.updateMany({
        where: {
          userId: user.id,
          folderId: { in: folderIds },
          deletedAt: null,
        },
        data: { deletedAt },
      }),
      prisma.shareLink.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          file: { folderId: { in: folderIds } },
        },
        data: { revokedAt: deletedAt },
      }),
    ]);

    revalidateFolderViews();
    revalidatePath("/trash");
    return { success: true, message: "Folder moved to trash." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function moveFolder(input: unknown): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();
  const parsed = moveFolderSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid folder move." };

  const { folderId, parentFolderId } = parsed.data;
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!folder) return { success: false, message: "That folder could not be found." };

  try {
    const result = await prisma.$transaction(async (transaction) => {
      if (parentFolderId) {
        const parent = await transaction.folder.findFirst({
          where: { id: parentFolderId, userId: user.id, deletedAt: null },
          select: { id: true },
        });
        if (!parent) return "missing-parent";

        const subtree = await transaction.$queryRaw<Array<{ id: string }>>`
          WITH RECURSIVE descendants(id) AS (
            SELECT "id" FROM "Folder" WHERE "id" = ${folderId} AND "userId" = ${user.id} AND "deletedAt" IS NULL
            UNION ALL
            SELECT child."id" FROM "Folder" child
            INNER JOIN descendants parent ON child."parentFolderId" = parent."id"
            WHERE child."userId" = ${user.id}
          )
          SELECT id FROM descendants WHERE id = ${parentFolderId} LIMIT 1
        `;
        if (subtree.length) return "cycle";
      }

      const destinationParentKey = parentFolderId ?? "root";
      const source = await transaction.folder.findFirst({
        where: { id: folderId, userId: user.id, deletedAt: null },
        select: { slug: true },
      });
      if (!source) return "missing-folder";
      const nameCollision = await transaction.folder.findFirst({
        where: {
          userId: user.id,
          parentKey: destinationParentKey,
          slug: source.slug,
          deletedAt: null,
          NOT: { id: folderId },
        },
        select: { id: true },
      });
      if (nameCollision) return "collision";
      const moved = await transaction.folder.updateMany({
        where: { id: folderId, userId: user.id, deletedAt: null },
        data: { parentFolderId, parentKey: destinationParentKey },
      });
      return moved.count === 1 ? "moved" : "missing-folder";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result === "missing-parent") return { success: false, message: "Destination folder not found." };
    if (result === "cycle") return { success: false, message: "A folder cannot be moved inside itself or its descendants." };
    if (result === "collision") return { success: false, message: "A folder with that name already exists in the destination." };
    if (result !== "moved") return { success: false, message: "That folder could not be found." };
    revalidateFolderViews();
    return { success: true, message: "Folder moved." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function getFolderTree(): Promise<FolderTreeNode[]> {
  const user = await requireUser();
  const folders = await prisma.folder.findMany({
    where: { userId: user.id, deletedAt: null },
    select: folderSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const nodes = new Map<string, FolderTreeNode>();
  for (const folder of folders) nodes.set(folder.id, { ...toFolderView(folder), children: [] });

  const roots: FolderTreeNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id);
    if (!node) continue;
    const parent = folder.parentFolderId ? nodes.get(folder.parentFolderId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function getFolderBreadcrumbsForUser(userId: string, folderId: string | null): Promise<FolderBreadcrumb[]> {
  if (!folderId) return [];
  const ancestors = await prisma.$queryRaw<Array<{ id: string; name: string; parentFolderId: string | null }>>`
    WITH RECURSIVE ancestors(id, name, "parentFolderId", depth) AS (
      SELECT "id", "name", "parentFolderId", 0 FROM "Folder"
      WHERE "id" = ${folderId} AND "userId" = ${userId} AND "deletedAt" IS NULL
      UNION ALL
      SELECT parent."id", parent."name", parent."parentFolderId", ancestors.depth + 1
      FROM "Folder" parent
      INNER JOIN ancestors ON parent."id" = ancestors."parentFolderId"
      WHERE parent."userId" = ${userId} AND parent."deletedAt" IS NULL AND ancestors.depth < 100
    )
    SELECT id, name, "parentFolderId" FROM ancestors ORDER BY depth DESC
  `;
  return ancestors.map(({ id, name }) => ({ id, name }));
}

export async function getBreadcrumbs(folderId: unknown): Promise<FolderBreadcrumb[]> {
  const user = await requireUser();
  if (folderId === null || folderId === undefined || folderId === "") return [];
  const parsed = folderIdSchema.safeParse(folderId);
  if (!parsed.success) return [];
  return getFolderBreadcrumbsForUser(user.id, parsed.data);
}

export async function getFolderContents(input: unknown): Promise<FolderContents> {
  const user = await requireUser();
  const parsed = folderContentsSchema.safeParse(input);
  if (!parsed.success) {
    return { folder: null, folders: [], files: [], breadcrumbs: [], totalFolders: 0, totalFiles: 0 };
  }
  const { folderId, query, category, sort, page } = parsed.data;

  if (folderId) {
    const ownedFolder = await prisma.folder.findFirst({
      where: { id: folderId, userId: user.id, deletedAt: null },
      select: folderSelect,
    });
    if (!ownedFolder) {
      return { folder: null, folders: [], files: [], breadcrumbs: [], totalFolders: 0, totalFiles: 0 };
    }
  }

  const folderWhere: Prisma.FolderWhereInput = query
    ? { userId: user.id, deletedAt: null }
    : { userId: user.id, parentFolderId: folderId, deletedAt: null };
  const fileWhere: Prisma.FileWhereInput = query
    ? { userId: user.id, deletedAt: null }
    : { userId: user.id, folderId, deletedAt: null };
  if (category === "favorites") fileWhere.isFavorite = true;
  else if (category === "pdf") fileWhere.extension = "pdf";
  else if (category === "videos") fileWhere.mimeType = { startsWith: "video/" };
  else if (category === "audio") fileWhere.mimeType = { startsWith: "audio/" };
  else if (category === "other") {
    fileWhere.NOT = [
      { extension: { in: Object.keys(ALLOWED_FILE_TYPES) } },
      { mimeType: { startsWith: "video/" } },
      { mimeType: { startsWith: "audio/" } },
    ];
  } else if (category !== "all") {
    const extensions = Object.entries(ALLOWED_FILE_TYPES)
      .filter(([, type]) => type.category === category)
      .map(([extension]) => extension);
    fileWhere.extension = { in: extensions };
  }
  if (query) {
    folderWhere.name = { contains: query, mode: "insensitive" };
    fileWhere.OR = [
      { originalName: { contains: query, mode: "insensitive" } },
      { extension: { contains: query.replace(/^\./, ""), mode: "insensitive" } },
      { mimeType: { contains: query, mode: "insensitive" } },
    ];
  }

  const fileSort = orderByForFiles(sort);
  const currentFolder = folderId
    ? await prisma.folder.findFirst({ where: { id: folderId, userId: user.id, deletedAt: null }, select: folderSelect })
    : null;
  const [folders, fileRows, totalFolders, totalFiles] = await prisma.$transaction([
    prisma.folder.findMany({ where: folderWhere, select: folderSelect, orderBy: [{ name: "asc" }, { id: "asc" }], take: query ? 50 : undefined }),
    prisma.file.findMany({ where: fileWhere, select: fileSelect, orderBy: fileSort, skip: getFilePageOffset(page), take: FILE_PAGE_SIZE }),
    prisma.folder.count({ where: folderWhere }),
    prisma.file.count({ where: fileWhere }),
  ]);

  return {
    folder: currentFolder ? toFolderView(currentFolder) : null,
    folders: folders.map(toFolderView),
    files: fileRows.map(toFileRecord),
    breadcrumbs: await getFolderBreadcrumbsForUser(user.id, folderId),
    totalFolders,
    totalFiles,
  };
}

export async function moveFileToFolder(input: unknown): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();
  const parsed = moveFileSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid file move." };
  const { fileId, folderId } = parsed.data;
  if (folderId) {
    const destination = await prisma.folder.findFirst({ where: { id: folderId, userId: user.id, deletedAt: null }, select: { id: true } });
    if (!destination) return { success: false, message: "Destination folder not found." };
  }
  const moved = await prisma.file.updateMany({
    where: { id: fileId, userId: user.id, deletedAt: null },
    data: { folderId },
  });
  if (!moved.count) return { success: false, message: "That file could not be found." };
  revalidateFolderViews();
  return { success: true, message: folderId ? "File moved." : "File moved to My Files." };
}

export async function searchWorkspace(input: unknown): Promise<WorkspaceSearchResults> {
  const user = await requireUser();
  const parsed = workspaceSearchSchema.safeParse(input);
  if (!parsed.success) return { folders: [], files: [], totalFolders: 0, totalFiles: 0 };
  const { query, page } = parsed.data;
  const folderWhere: Prisma.FolderWhereInput = {
    userId: user.id,
    deletedAt: null,
    name: { contains: query, mode: "insensitive" },
  };
  const fileWhere: Prisma.FileWhereInput = {
    userId: user.id,
    deletedAt: null,
    OR: [
      { originalName: { contains: query, mode: "insensitive" } },
      { extension: { contains: query.replace(/^\./, ""), mode: "insensitive" } },
      { mimeType: { contains: query, mode: "insensitive" } },
    ],
  };
  const [folders, files, totalFolders, totalFiles] = await prisma.$transaction([
    prisma.folder.findMany({ where: folderWhere, select: folderSelect, orderBy: [{ name: "asc" }, { id: "asc" }], take: 50 }),
    prisma.file.findMany({ where: fileWhere, select: fileSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: getFilePageOffset(page), take: FILE_PAGE_SIZE }),
    prisma.folder.count({ where: folderWhere }),
    prisma.file.count({ where: fileWhere }),
  ]);
  after(async () => {
    await prisma.searchEvent
      .create({
        data: {
          userId: user.id,
          query,
          resultCount: totalFolders + totalFiles,
          source: "workspace",
        },
      })
      .catch((error: unknown) => {
        log.error("Failed to record a search event", error);
      });
  });
  return {
    folders: folders.map(toFolderView),
    files: files.map(toFileRecord),
    totalFolders,
    totalFiles,
  };
}

export async function getRecentFiles(): Promise<{ files: FileRecordView[]; total: number }> {
  const user = await requireUser();
  const [files, total] = await prisma.$transaction([
    prisma.file.findMany({
      where: { userId: user.id, deletedAt: null },
      select: fileSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: FILE_PAGE_SIZE,
    }),
    prisma.file.count({ where: { userId: user.id, deletedAt: null } }),
  ]);
  return { files: files.map(toFileRecord), total };
}