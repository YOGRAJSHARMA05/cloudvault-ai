"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  changePassword,
  deleteAccount,
  savePreferences,
  updateProfile,
  type UserPreferences,
} from "@/app/actions/settings";

type SettingsUser = {
  name: string;
  email: string;
  image: string;
  hasPassword: boolean;
  role: string;
  createdAt: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function SettingsClient({
  user,
  initialPreferences,
}: {
  user: SettingsUser;
  initialPreferences: UserPreferences;
}) {
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState(user.image);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [preferences, setPreferences] = useState<UserPreferences>(initialPreferences);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  function run(
    action: () => Promise<{ success: boolean; message: string }>,
    onSuccess?: () => void,
  ) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        setNotice(result.message);
        onSuccess?.();
      } else {
        setError(result.message);
      }
    });
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => updateProfile({ name, image }));
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    run(
      () => changePassword({ currentPassword, newPassword }),
      () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      },
    );
  }

  function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => savePreferences(preferences));
  }

  function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Delete your account and all files permanently? This cannot be undone.")) {
      return;
    }
    run(() => deleteAccount({ confirmEmail, password: deletePassword }));
  }

  return (
    <div className="space-y-6">
      {notice || error ? (
        <div
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-400/20 bg-rose-400/5 text-rose-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
          <h2 className="text-base font-semibold text-white">Profile</h2>
          <p className="mt-1 text-xs text-slate-500">Account created {formatDate(user.createdAt)} · {user.role.toLowerCase()}</p>
          <form className="mt-5 space-y-4" onSubmit={submitProfile}>
            <label className="block text-xs font-medium text-slate-400" htmlFor="profile-email">
              Email
              <input className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-500" disabled id="profile-email" type="email" value={user.email} />
            </label>
            <label className="block text-xs font-medium text-slate-400" htmlFor="profile-name">
              Display name
              <input className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50" id="profile-name" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label className="block text-xs font-medium text-slate-400" htmlFor="profile-image">
              Avatar URL (optional)
              <input className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50" id="profile-image" maxLength={2048} onChange={(event) => setImage(event.target.value)} placeholder="https://…" type="url" value={image} />
            </label>
            <button className="min-h-10 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50" disabled={busy || !name.trim()} type="submit">
              {busy ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
          <h2 className="text-base font-semibold text-white">Password</h2>
          <p className="mt-1 text-xs text-slate-500">
            {user.hasPassword ? "Use at least 12 characters for a strong password." : "Set a password to enable email and password sign-in."}
          </p>
          <form className="mt-5 space-y-4" onSubmit={submitPassword}>
            {user.hasPassword ? (
              <label className="block text-xs font-medium text-slate-400" htmlFor="current-password">
                Current password
                <input autoComplete="current-password" className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50" id="current-password" maxLength={72} onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
              </label>
            ) : null}
            <label className="block text-xs font-medium text-slate-400" htmlFor="new-password">
              New password
              <input autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50" id="new-password" maxLength={72} minLength={12} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
            </label>
            <label className="block text-xs font-medium text-slate-400" htmlFor="confirm-password">
              Confirm new password
              <input autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/50" id="confirm-password" maxLength={72} minLength={12} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
            </label>
            <button className="min-h-10 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50" disabled={busy || newPassword.length < 12} type="submit">
              {busy ? "Updating…" : user.hasPassword ? "Change password" : "Set password"}
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
        <h2 className="text-base font-semibold text-white">Preferences</h2>
        <p className="mt-1 text-xs text-slate-500">Stored on this browser to personalize your workspace.</p>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submitPreferences}>
          <label className="block text-xs font-medium text-slate-400" htmlFor="pref-theme">
            Theme
            <select
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-400/50"
              id="pref-theme"
              onChange={(event) => setPreferences((current) => ({ ...current, theme: event.target.value as UserPreferences["theme"] }))}
              value={preferences.theme}
            >
              <option value="dark">Dark</option>
              <option value="system">Follow system</option>
            </select>
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Toggle
              checked={preferences.emailNotifications}
              label="Email notifications"
              onChange={(checked) => setPreferences((current) => ({ ...current, emailNotifications: checked }))}
            />
            <Toggle
              checked={preferences.productUpdates}
              label="Product updates"
              onChange={(checked) => setPreferences((current) => ({ ...current, productUpdates: checked }))}
            />
            <Toggle
              checked={preferences.compactMode}
              label="Compact file list"
              onChange={(checked) => setPreferences((current) => ({ ...current, compactMode: checked }))}
            />
          </div>
          <div className="sm:col-span-2">
            <button className="min-h-10 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50" disabled={busy} type="submit">
              {busy ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-5">
        <h2 className="text-base font-semibold text-rose-200">Danger zone</h2>
        <p className="mt-1 text-xs leading-5 text-rose-200/70">
          Deleting your account permanently removes your files, folders, share links, and AI analysis. This cannot be undone.
        </p>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submitDelete}>
          <label className="block text-xs font-medium text-rose-200/80" htmlFor="delete-email">
            Confirm email
            <input className="mt-1.5 w-full rounded-xl border border-rose-400/20 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-rose-400/50" id="delete-email" onChange={(event) => setConfirmEmail(event.target.value)} placeholder={user.email} required type="email" value={confirmEmail} />
          </label>
          {user.hasPassword ? (
            <label className="block text-xs font-medium text-rose-200/80" htmlFor="delete-password">
              Password
              <input autoComplete="current-password" className="mt-1.5 w-full rounded-xl border border-rose-400/20 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-rose-400/50" id="delete-password" maxLength={72} onChange={(event) => setDeletePassword(event.target.value)} required type="password" value={deletePassword} />
            </label>
          ) : null}
          <div className="sm:col-span-2">
            <button className="min-h-10 rounded-xl bg-rose-500/15 px-4 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50" disabled={busy || confirmEmail.toLowerCase() !== user.email.toLowerCase()} type="submit">
              {busy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-300">
      <span>{label}</span>
      <input
        checked={checked}
        className="size-4 accent-blue-500"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
