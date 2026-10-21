import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-guard";
import { getDashboardStats, listUserFiles } from "@/app/actions/files";
import { FilesDashboard } from "@/components/files/FilesDashboard";

export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  const [{ files, total }, stats] = await Promise.all([
    listUserFiles({ query: "", category: "all", sort: "newest", page: 1 }),
    getDashboardStats(),
  ]);

  return (
    <FilesDashboard
      initialFiles={files}
      initialStats={stats}
      initialTotal={total}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
      userName={user.name}
    />
  );
}