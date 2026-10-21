"use client";

import { useActionState } from "react";
import { googleLoginAction } from "@/app/actions/auth";

export function GoogleSignInButton({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(googleLoginAction, null);

  if (!enabled) return null;

  return (
    <div className="mt-6">
      <div className="relative mb-5">
        <div aria-hidden="true" className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-900 px-3 text-xs text-slate-500">
            or continue with
          </span>
        </div>
      </div>

      <form action={action}>
        <button
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          <span aria-hidden="true" className="text-base font-bold text-white">
            G
          </span>
          {pending ? "Connecting to Google…" : "Continue with Google"}
        </button>
      </form>

      {state?.error ? (
        <p aria-live="polite" className="mt-3 text-sm text-rose-200" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}