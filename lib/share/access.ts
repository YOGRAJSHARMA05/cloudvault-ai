import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ACCESS_TTL_MS = 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.SHARE_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("SHARE_SECRET or AUTH_SECRET must be configured.");
  }
  return secret;
}

function sign(token: string, expiresAt: number): string {
  return createHmac("sha256", getSecret())
    .update(`${token}.${expiresAt}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createShareAccessValue(token: string): string {
  const expiresAt = Date.now() + ACCESS_TTL_MS;
  return `${expiresAt}.${sign(token, expiresAt)}`;
}

export function verifyShareAccessValue(
  token: string,
  value: string | undefined,
): boolean {
  if (!value) return false;
  const [expiresAtRaw, signature] = value.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !signature) {
    return false;
  }
  try {
    return safeEqual(signature, sign(token, expiresAt));
  } catch {
    return false;
  }
}

export function shareCookieName(token: string): string {
  return `cv_share_${token}`;
}

export async function hasShareAccess(token: string): Promise<boolean> {
  const store = await cookies();
  return verifyShareAccessValue(token, store.get(shareCookieName(token))?.value);
}

export async function setShareAccess(token: string): Promise<void> {
  const store = await cookies();
  store.set(shareCookieName(token), createShareAccessValue(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TTL_MS / 1000,
  });
}
