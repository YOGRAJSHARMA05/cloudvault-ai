import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "cloudvault";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim();

export class SupabaseStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseStorageError";
  }
}

let client: SupabaseClient | null = null;
let bucketPromise: Promise<void> | null = null;

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

function getClient(): SupabaseClient {
  if (!isSupabaseStorageConfigured()) {
    throw new SupabaseStorageError(
      "Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function getStorageBucket(): string {
  return STORAGE_BUCKET;
}

function validateObjectId(value: string, label: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new SupabaseStorageError(`Invalid ${label}.`);
  }
}

function getObjectPath(userId: string, storedName: string): string {
  validateObjectId(userId, "user identifier");
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/.test(storedName)) {
    throw new SupabaseStorageError("Invalid stored file name.");
  }
  return `${userId}/${storedName}`;
}

const STORAGE_PROBE_TIMEOUT_MS = 3_000;

/**
 * Verifies that the configured bucket exists and is reachable. Used by the
 * health endpoint; never uploads or downloads file data.
 */
export async function checkStorageConnection(): Promise<void> {
  const supabase = getClient();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new SupabaseStorageError("Storage health check timed out.")),
      STORAGE_PROBE_TIMEOUT_MS,
    ).unref?.();
  });

  const { data, error } = await Promise.race([
    supabase.storage.getBucket(STORAGE_BUCKET),
    timeout,
  ]);
  if (error) {
    throw new SupabaseStorageError(`Storage health check failed: ${error.message}`);
  }
  if (!data) {
    throw new SupabaseStorageError(`Storage bucket "${STORAGE_BUCKET}" was not found.`);
  }
}

async function ensureBucket(): Promise<void> {
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const supabase = getClient();
      const { data } = await supabase.storage.getBucket(STORAGE_BUCKET);
      if (data) return;

      const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: false,
        fileSizeLimit: 25 * 1024 * 1024,
      });
      if (error && !/already exists/i.test(error.message)) {
        throw new SupabaseStorageError(`Could not create the storage bucket: ${error.message}`);
      }
    })().catch((error: unknown) => {
      bucketPromise = null;
      throw error;
    });
  }
  await bucketPromise;
}

export async function uploadObject(
  userId: string,
  storedName: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  await ensureBucket();
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(getObjectPath(userId, storedName), data, {
      contentType,
      upsert: false,
      cacheControl: "private, max-age=0",
    });
  if (error) {
    throw new SupabaseStorageError(`Could not upload the file: ${error.message}`);
  }
}

export async function downloadObject(
  userId: string,
  storedName: string,
): Promise<Buffer> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(getObjectPath(userId, storedName));
  if (error || !data) {
    throw new SupabaseStorageError(`Could not download the file: ${error?.message ?? "not found"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteObject(
  userId: string,
  storedName: string,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([getObjectPath(userId, storedName)]);
  if (error) {
    throw new SupabaseStorageError(`Could not delete the file: ${error.message}`);
  }
}

export async function createSignedObjectUrl(
  userId: string,
  storedName: string,
  expiresInSeconds = 300,
): Promise<string> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(getObjectPath(userId, storedName), expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new SupabaseStorageError(
      `Could not create a signed URL: ${error?.message ?? "unknown error"}`,
    );
  }
  return data.signedUrl;
}
