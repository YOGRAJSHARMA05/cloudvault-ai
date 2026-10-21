import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters for your password.")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "Password must be no more than 72 bytes.",
  );

const loginPasswordSchema = z
  .string()
  .min(1, "Enter your password.")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "Password must be no more than 72 bytes.",
  );

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: loginPasswordSchema,
});

export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string[]>>;
} | null;