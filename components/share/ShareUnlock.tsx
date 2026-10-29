"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ShareUnlock({
  token,
  fileName,
}: {
  token: string;
  fileName: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/share/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not unlock this link.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not unlock this link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/8 bg-white/[0.025] p-7 shadow-2xl">
        <span className="flex size-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
          <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
            <rect height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" width="14" x="5" y="10" />
            <path d="M8.5 10V7.5a3.5 3.5 0 1 1 7 0V10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            <circle cx="12" cy="15.5" fill="currentColor" r="1.3" />
          </svg>
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Password required</h1>
        <p className="mt-2 break-words text-sm leading-6 text-slate-400">
          Enter the password to open <span className="font-medium text-slate-200">{fileName}</span>.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm text-slate-300" htmlFor="share-password">
            Share password
          </label>
          <input
            autoFocus
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50"
            id="share-password"
            maxLength={128}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error ? (
            <p aria-live="polite" className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2.5 text-sm text-rose-200" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="min-h-11 w-full rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50"
            disabled={loading || !password}
            type="submit"
          >
            {loading ? "Unlocking…" : "Unlock file"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Shared securely with CloudVault AI
        </p>
      </section>
    </main>
  );
}
