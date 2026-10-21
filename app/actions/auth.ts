"use server";

import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { googleAuthEnabled, signIn } from "@/auth";
import { signInSchema, signUpSchema, type AuthFormState } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email or password is incorrect. Please try again." };
    }
    throw error;
  }

  return null;
}

export async function googleLoginAction(
  _previousState: AuthFormState,
  _formData: FormData,
): Promise<AuthFormState> {
  void _previousState;
  void _formData;

  if (!googleAuthEnabled) {
    return { error: "Google sign-in is not configured yet. Use your email and password." };
  }

  try {
    await signIn("google", { redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Google sign-in could not be completed. Please try again." };
    }
    throw error;
  }

  return null;
}

export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const passwordHash = await hash(parsed.data.password, 12);
    await prisma.user.create({
      data: { name: parsed.data.name, email, passwordHash },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "An account with this email already exists. Try signing in." };
    }
    throw error;
  }

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Your account was created. Please sign in to continue." };
    }
    throw error;
  }

  return null;
}