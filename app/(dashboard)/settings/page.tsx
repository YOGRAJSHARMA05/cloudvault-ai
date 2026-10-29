import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const instant = false;

function parsePreferences(raw: string | undefined) {
  const defaults = {
    theme: "dark" as "dark" | "system",
    emailNotifications: true,
    productUpdates: false,
    compactMode: false,
  };
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<typeof defaults>;
    return {
      theme: parsed.theme === "system" ? ("system" as const) : ("dark" as const),
      emailNotifications:
        typeof parsed.emailNotifications === "boolean"
          ? parsed.emailNotifications
          : defaults.emailNotifications,
      productUpdates:
        typeof parsed.productUpdates === "boolean"
          ? parsed.productUpdates
          : defaults.productUpdates,
      compactMode:
        typeof parsed.compactMode === "boolean"
          ? parsed.compactMode
          : defaults.compactMode,
    };
  } catch {
    return defaults;
  }
}

export default async function SettingsPage() {
  const sessionUser = await requireUser();
  const [account, store] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        name: true,
        email: true,
        image: true,
        passwordHash: true,
        role: true,
        createdAt: true,
      },
    }),
    cookies(),
  ]);

  if (!account) redirect("/login");

  const preferences = parsePreferences(store.get("cv_preferences")?.value);

  return (
    <WorkspaceShell
      description="Manage your profile, password, workspace preferences, and account data."
      title="Settings"
    >
      <SettingsClient
        initialPreferences={preferences}
        user={{
          name: account.name ?? "",
          email: account.email,
          image: account.image ?? "",
          hasPassword: Boolean(account.passwordHash),
          role: account.role,
          createdAt: account.createdAt.toISOString(),
        }}
      />
    </WorkspaceShell>
  );
}
