"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  ALLOWED_FILE_TYPES,
  FILE_PAGE_SIZE,
  type FileSort,
} from "@/constants/files";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  FileStorageError,
  getValidatedFileInfo,
  moveUserFileToTrash,
  purgeTrashedUserFile,
  restoreUserFileFromTrash,
  storeUserFile,
  validateFileSignature,
} from "@/lib/file-storage";
import {
  fileIdSchema,
  fileUploadMetadataSchema,
  getFilePageOffset,
  listFilesSchema,
  renameFileSchema,
} from "@/lib/file-validation";
import type {
  DashboardStats,
  FileActionResult,
  FileListResult,
  FileRecordView,
} from "@/types/files";

const fileViewSelect = {
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

function toFileView(
  file: Prisma.FileGetPayload<{ select: typeof fileViewSelect }>,
): FileRecordView {
  return {
    ...file,
    size: file.size.toString(),
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

function actionError<T = undefined>(error: unknown): FileActionResult<T> {
  if (error instanceof FileStorageError) {
    return { success: false, message: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return { success: false, message: "That file could not be found." };
  }
  console.error("File management action failed", error);
  return { success: false, message: "Something went wrong. Please try again." };
}

export async function listUserFiles(input: unknown): Promise<FileListResult> {
  const user = await requireUser();
  const parsed = listFilesSchema.safeParse(input);
  if (!parsed.success) return { files: [], total: 0 };

  const { query, category, sort, page } = parsed.data;
  const where: Prisma.FileWhereInput = { userId: user.id };

  if (category === "favorites") where.isFavorite = true;
  else if (category === "pdf") where.extension = "pdf";
  else if (category === "videos") where.mimeType = { startsWith: "video/" };
  else if (category === "audio") where.mimeType = { startsWith: "audio/" };
  else if (category === "other") {
    where.NOT = [
      { extension: { in: Object.keys(ALLOWED_FILE_TYPES) } },
      { mimeType: { startsWith: "video/" } },
      { mimeType: { startsWith: "audio/" } },
    ];
  } else if (category !== "all") {
    const extensions = Object.entries(ALLOWED_FILE_TYPES)
      .filter(([, type]) => type.category === category)
      .map(([extension]) => extension);
    where.extension = { in: extensions };
  }

  if (query) {
    where.OR = [
      { originalName: { contains: query, mode: "insensitive" } },
      { extension: { contains: query.replace(/^\./, ""), mode: "insensitive" } },
      { mimeType: { contains: query, mode: "insensitive" } },
    ];
  }

  const orderByBySort = {
    newest: [{ createdAt: "desc" }, { id: "desc" }],
    oldest: [{ createdAt: "asc" }, { id: "asc" }],
    largest: [{ size: "desc" }, { createdAt: "desc" }],
    smallest: [{ size: "asc" }, { createdAt: "desc" }],
    "name-asc": [{ originalName: "asc" }, { id: "asc" }],
    "name-desc": [{ originalName: "desc" }, { id: "desc" }],
  } satisfies Record<FileSort, Prisma.FileOrderByWithRelationInput[]>;
  const orderBy = orderByBySort[sort];

  const [files, total] = await prisma.$transaction([
    prisma.file.findMany({
      where,
      select: fileViewSelect,
      orderBy,
      skip: getFilePageOffset(page),
      take: FILE_PAGE_SIZE,
    }),
    prisma.file.count({ where }),
  ]);

  return { files: files.map(toFileView), total };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const user = await requireUser();
  const [aggregate, totalFiles, favoriteFiles] = await Promise.all([
    prisma.file.aggregate({ where: { userId: user.id }, _sum: { size: true } }),
    prisma.file.count({ where: { userId: user.id } }),
    prisma.file.count({ where: { userId: user.id, isFavorite: true } }),
  ]);
  const totalBytes = aggregate._sum.size ?? BigInt(0);

  return {
    totalBytes: totalBytes.toString(),
    totalFiles,
    favoriteFiles,
    averageBytes: totalFiles ? (totalBytes / BigInt(totalFiles)).toString() : "0",
  };
}

export async function uploadUserFile(
  formData: FormData,
): Promise<FileActionResult<FileRecordView>> {
  const user = await requireUser();
  const entry = formData.get("file");
  if (!(entry instanceof File)) {
    return { success: false, message: "Choose a file to upload." };
  }

  const metadata = fileUploadMetadataSchema.safeParse({
    fileName: entry.name,
    fileSize: entry.size,
    fileType: entry.type,
  });
  if (!metadata.success) {
    return { success: false, message: "The file must be 25 MB or smaller." };
  }

  let storedName: string | undefined;
  try {
    const info = getValidatedFileInfo(entry);
    const data = new Uint8Array(await entry.arrayBuffer());
    if (!validateFileSignature(info.extension, data)) {
      return { success: false, message: "The file content does not match its file type." };
    }

    storedName = await storeUserFile(user.id, info.extension, data);
    const record = await prisma.file.create({
      data: {
        userId: user.id,
        originalName: info.originalName,
        storedName,
        mimeType: info.mimeType,
        extension: info.extension,
        size: BigInt(entry.size),
      },
      select: fileViewSelect,
    });

    revalidatePath("/dashboard");
    return {
      success: true,
      message: `${info.originalName} uploaded successfully.`,
      data: toFileView(record),
    };
  } catch (error) {
    if (storedName) {
      const { removeUserFile } = await import("@/lib/file-storage");
      await removeUserFile(user.id, storedName).catch((cleanupError: unknown) => {
        console.error("Failed to clean up an incomplete upload", cleanupError);
      });
    }
    return actionError(error);
  }
}

export async function renameUserFile(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = renameFileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Enter a valid file name." };
  }

  const { fileId, name } = parsed.data;
  const current = await prisma.file.findFirst({
    where: { id: fileId, userId: user.id },
    select: { originalName: true, extension: true },
  });
  if (!current) return { success: false, message: "That file could not be found." };

  const finalName = /\.[^.]+$/.test(name) ? name : `${name}.${current.extension}`;
  if (finalName.split(".").at(-1)?.toLowerCase() !== current.extension) {
    return { success: false, message: "Keep the file’s original extension." };
  }

  try {
    await prisma.file.updateMany({
      where: { id: fileId, userId: user.id },
      data: { originalName: finalName },
    });
    revalidatePath("/dashboard");
    return { success: true, message: "File renamed." };
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleFileFavorite(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = fileIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid file." };

  try {
    const [updated] = await prisma.$queryRaw<Array<{ isFavorite: boolean }>>`
      UPDATE "File"
      SET "isFavorite" = NOT "isFavorite", "updatedAt" = NOW()
      WHERE "id" = ${parsed.data.fileId} AND "userId" = ${user.id}
      RETURNING "isFavorite"
    `;
    if (!updated) return { success: false, message: "That file could not be found." };
    revalidatePath("/dashboard");
    return {
      success: true,
      message: updated.isFavorite ? "Added to favorites." : "Removed from favorites.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteUserFile(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = fileIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid file." };

  const file = await prisma.file.findFirst({
    where: { id: parsed.data.fileId, userId: user.id },
    select: { id: true, storedName: true },
  });
  if (!file) return { success: false, message: "That file could not be found." };

  let trashPath: string | undefined;
  try {
    trashPath = await moveUserFileToTrash(user.id, file.storedName);
    const deleted = await prisma.file.deleteMany({
      where: { id: file.id, userId: user.id },
    });
    if (!deleted.count) {
      await restoreUserFileFromTrash(user.id, trashPath, file.storedName);
      trashPath = undefined;
      return { success: false, message: "That file could not be found." };
    }
    await purgeTrashedUserFile(trashPath).catch((cleanupError: unknown) => {
      console.error("Failed to purge deleted file bytes", cleanupError);
    });
    trashPath = undefined;
    revalidatePath("/dashboard");
    return { success: true, message: "File deleted." };
  } catch (error) {
    if (trashPath) {
      await restoreUserFileFromTrash(user.id, trashPath, file.storedName).catch(
        (restoreError: unknown) => {
          console.error("Failed to restore file after an incomplete delete", restoreError);
        },
      );
    }
    return actionError(error);
  }
}
