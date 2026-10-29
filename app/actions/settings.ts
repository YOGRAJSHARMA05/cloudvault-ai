"use server";

import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-guard";
import { removeUserFile } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";
import type { FileActionResult } from "@/types/files";

import { createLogger } from "@/lib/logger";

const log = createLogger("actions:settings");

const newPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters for your password.")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "Password must be no more than 72 bytes.",
  );

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
  image: z
    .union([z.string().trim().url("Enter a valid image URL.").max(2048), z.literal("")])
    .optional()
    .default(""),
});

const passwordSchema = z.object({
  currentPassword: z.string().max(72).optional().default(""),
  newPassword: newPasswordSchema,
});

const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().email(),
  password: z.string().max(72).optional().default(""),
});

const preferencesSchema = z.object({
  theme: z.enum(["dark", "system"]).default("dark"),
  emailNotifications: z.boolean().default(true),
  productUpdates: z.boolean().default(false),
  compactMode: z.boolean().default(false),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;

export async function updateProfile(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Check your profile details.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        image: parsed.data.image || null,
      },
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { success: true, message: "Profile updated." };
  } catch (error) {
    log.error("Failed to update profile", error);
    return { success: false, message: "Could not update your profile." };
  }
}

export async function changePassword(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Check your password.",
    };
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!account) return { success: false, message: "Your account could not be found." };

    if (account.passwordHash) {
      if (!parsed.data.currentPassword) {
        return { success: false, message: "Enter your current password." };
      }
      const matches = await compare(
        parsed.data.currentPassword,
        account.passwordHash,
      );
      if (!matches) {
        return { success: false, message: "Your current password is incorrect." };
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(parsed.data.newPassword, 12) },
    });
    revalidatePath("/settings");
    return { success: true, message: "Password changed." };
  } catch (error) {
    log.error("Failed to change password", error);
    return { success: false, message: "Could not change your password." };
  }
}

export async function savePreferences(input: unknown): Promise<FileActionResult> {
  await requireUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Check your preferences." };
  }

  const store = await cookies();
  store.set("cv_preferences", JSON.stringify(parsed.data), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/settings");
  return { success: true, message: "Preferences saved." };
}

export async function deleteAccount(input: unknown): Promise<FileActionResult> {
  const user = await requireUser();
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Confirm your email address to continue." };
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, passwordHash: true },
  });
  if (!account) return { success: false, message: "Your account could not be found." };

  if (parsed.data.confirmEmail.toLowerCase() !== account.email.toLowerCase()) {
    return { success: false, message: "The email address does not match your account." };
  }

  if (account.passwordHash) {
    if (!parsed.data.password) {
      return { success: false, message: "Enter your password to delete your account." };
    }
    const matches = await compare(parsed.data.password, account.passwordHash);
    if (!matches) {
      return { success: false, message: "Your password is incorrect." };
    }
  }

  const files = await prisma.file.findMany({
    where: { userId: user.id },
    select: { storedName: true },
  });

  try {
    await prisma.user.delete({ where: { id: user.id } });
  } catch (error) {
    log.error("Failed to delete account", error);
    return { success: false, message: "Could not delete your account." };
  }

  for (const file of files) {
    await removeUserFile(user.id, file.storedName).catch((error: unknown) => {
      log.error("Failed to remove file while deleting account", error);
    });
  }

  await signOut({ redirectTo: "/" });
  return { success: true, message: "Your account has been deleted." };
}
