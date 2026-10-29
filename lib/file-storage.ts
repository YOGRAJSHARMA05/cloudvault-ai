import "server-only";

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "@/constants/files";
import {
  checkStorageConnection,
  createSignedObjectUrl,
  deleteObject,
  downloadObject,
  isSupabaseStorageConfigured,
  uploadObject,
} from "@/lib/storage/supabase-storage";

const configuredStorageRoot = process.env.CLOUDVAULT_STORAGE_DIR?.trim();
const storageRoot = configuredStorageRoot
  ? path.resolve(configuredStorageRoot)
  : path.join(process.cwd(), "storage", "uploads");

export type StorageBackend = "supabase" | "local";

export function getStorageBackend(): StorageBackend {
  return isSupabaseStorageConfigured() ? "supabase" : "local";
}

export function getStorageRoot(): string {
  return storageRoot;
}

/**
 * Lightweight readiness probe for the active storage backend. For local disk it
 * verifies the directory exists and is writable; for Supabase it checks the
 * bucket without transferring file data.
 */
export async function checkStorageHealth(): Promise<StorageBackend> {
  if (isSupabaseStorageConfigured()) {
    await checkStorageConnection();
    return "supabase";
  }

  await mkdir(storageRoot, { recursive: true, mode: 0o700 });
  await access(storageRoot, constants.W_OK | constants.R_OK);
  return "local";
}

export class FileStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStorageError";
  }
}

export function sanitizeOriginalName(value: string): string {
  const filename = path.posix.basename(value.replaceAll("\\", "/"));
  const sanitized = filename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 180);

  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new FileStorageError("Enter a valid file name.");
  }
  return sanitized;
}

export function getValidatedFileInfo(file: File) {
  if (file.size <= 0) throw new FileStorageError("The selected file is empty.");
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new FileStorageError("Files must be 25 MB or smaller.");
  }

  const originalName = sanitizeOriginalName(file.name);
  const extension = path.extname(originalName).slice(1).toLowerCase();
  const allowedType = ALLOWED_FILE_TYPES[extension as keyof typeof ALLOWED_FILE_TYPES];

  if (!allowedType) {
    throw new FileStorageError("This file type is not supported.");
  }
  const acceptedMimeTypes = [
    allowedType.mimeType,
    ...("altMimeTypes" in allowedType ? allowedType.altMimeTypes ?? [] : []),
  ].map((value) => value.toLowerCase());
  const browserMimeType = file.type.toLowerCase();
  if (browserMimeType && !acceptedMimeTypes.includes(browserMimeType)) {
    throw new FileStorageError("The file type does not match its extension.");
  }

  return { originalName, extension, mimeType: allowedType.mimeType };
}

function validateStorageSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new FileStorageError(`Invalid ${label}.`);
  }
}

export function getUserStorageDirectory(userId: string): string {
  validateStorageSegment(userId, "user identifier");
  return path.join(storageRoot, userId);
}

export function getStoredFilePath(userId: string, storedName: string): string {
  validateStorageSegment(userId, "user identifier");
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/.test(storedName)) {
    throw new FileStorageError("Invalid stored file name.");
  }

  const directory = getUserStorageDirectory(userId);
  return path.join(directory, storedName);
}

export async function storeUserFile(
  userId: string,
  extension: string,
  data: Uint8Array,
  mimeType = "application/octet-stream",
): Promise<string> {
  if (isSupabaseStorageConfigured()) {
    try {
      const storedName = `${randomUUID()}.${extension}`;
      await uploadObject(userId, storedName, data, mimeType);
      return storedName;
    } catch (error) {
      throw new FileStorageError(
        error instanceof Error ? error.message : "Could not store the file.",
      );
    }
  }

  const directory = getUserStorageDirectory(userId);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const storedName = `${randomUUID()}.${extension}`;
    const filePath = getStoredFilePath(userId, storedName);
    try {
      const handle = await open(/*turbopackIgnore: true*/ filePath, "wx", 0o600);
      try {
        await handle.writeFile(data);
      } finally {
        await handle.close();
      }
      return storedName;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new FileStorageError("Could not allocate a unique storage name.");
}

export async function readUserFile(
  userId: string,
  storedName: string,
): Promise<Buffer> {
  if (isSupabaseStorageConfigured()) {
    try {
      return await downloadObject(userId, storedName);
    } catch (error) {
      throw new FileStorageError(
        error instanceof Error ? error.message : "Could not read the file.",
      );
    }
  }
  return readFile(/*turbopackIgnore: true*/ getStoredFilePath(userId, storedName));
}

export async function removeUserFile(
  userId: string,
  storedName: string,
): Promise<void> {
  if (isSupabaseStorageConfigured()) {
    try {
      await deleteObject(userId, storedName);
      return;
    } catch (error) {
      throw new FileStorageError(
        error instanceof Error ? error.message : "Could not delete the file.",
      );
    }
  }
  await rm(getStoredFilePath(userId, storedName), { force: true });
}

export async function createUserFileSignedUrl(
  userId: string,
  storedName: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (!isSupabaseStorageConfigured()) return null;
  try {
    return await createSignedObjectUrl(userId, storedName, expiresInSeconds);
  } catch (error) {
    throw new FileStorageError(
      error instanceof Error ? error.message : "Could not create a signed URL.",
    );
  }
}

export async function moveUserFileToTrash(
  userId: string,
  storedName: string,
): Promise<string> {
  const source = getStoredFilePath(userId, storedName);
  const trashName = `${randomUUID()}.deleting`;
  const trashPath = path.resolve(getUserStorageDirectory(userId), trashName);
  await rename(/*turbopackIgnore: true*/ source, trashPath);
  return trashPath;
}

export async function restoreUserFileFromTrash(
  userId: string,
  trashPath: string,
  storedName: string,
): Promise<void> {
  const expectedDirectory = getUserStorageDirectory(userId);
  if (path.dirname(trashPath) !== expectedDirectory || !trashPath.endsWith(".deleting")) {
    throw new FileStorageError("Invalid temporary storage path.");
  }
  await rename(
    /*turbopackIgnore: true*/ trashPath,
    getStoredFilePath(userId, storedName),
  );
}

export async function purgeTrashedUserFile(trashPath: string): Promise<void> {
  await rm(/*turbopackIgnore: true*/ trashPath, { force: true });
}

export function validateFileSignature(
  extension: string,
  data: Uint8Array,
): boolean {
  const bytes = Buffer.from(data);
  const textExtensions = new Set([
    "txt", "md", "markdown", "csv", "json", "js", "jsx", "ts", "tsx", "py",
    "rb", "go", "rs", "java", "c", "h", "cpp", "hpp", "cs", "php", "swift",
    "kt", "sh", "sql", "html", "css", "scss", "yml", "yaml", "xml", "toml", "ini",
  ]);

  switch (extension) {
    case "pdf":
      return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    case "png":
      return bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    case "jpg":
    case "jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "webp":
      return (
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "gif":
      return ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
    case "mp4":
      return bytes.subarray(4, 8).toString("ascii") === "ftyp";
    case "mp3": {
      const hasId3 = bytes.subarray(0, 3).toString("ascii") === "ID3";
      const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      return hasId3 || hasFrameSync;
    }
    case "doc":
      return bytes.subarray(0, 8).equals(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      );
    case "docx":
      return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    default:
      if (textExtensions.has(extension)) {
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          return !text.includes("\u0000");
        } catch {
          return false;
        }
      }
      return false;
  }
}

export function getFileCategory(extension: string) {
  return ALLOWED_FILE_TYPES[extension as keyof typeof ALLOWED_FILE_TYPES]?.category ?? "other";
}