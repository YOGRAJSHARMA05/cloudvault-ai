"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "@/app/actions/auth";
import { AuthField } from "@/components/auth/AuthField";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(signUpAction, null);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/75 p-7 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
          Start securely
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Create your account
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          One calm, secure home for all your files.
        </p>
      </div>

      <form action={action} className="space-y-5" noValidate>
        <AuthField
          autoComplete="name"
          error={state?.fieldErrors?.name?.[0]}
          id="name"
          label="Full name"
          maxLength={80}
          name="name"
          placeholder="Alex Morgan"
          required
        />
        <AuthField
          autoComplete="email"
          error={state?.fieldErrors?.email?.[0]}
          id="email"
          label="Email address"
          maxLength={254}
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <AuthField
          autoComplete="new-password"
          error={state?.fieldErrors?.password?.[0]}
          id="password"
          label="Password"
          minLength={12}
          name="password"
          placeholder="At least 12 characters"
          required
          type="password"
        />

        {state?.error ? (
          <p
            aria-live="polite"
            className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}

        <button
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <GoogleSignInButton enabled={googleEnabled} />

      <p className="mt-7 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link className="font-medium text-blue-300 hover:text-blue-200" href="/login">
          Sign in
        </Link>
      </p>
    </section>
  );
}