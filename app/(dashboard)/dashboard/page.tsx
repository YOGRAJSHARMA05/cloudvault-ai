import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-guard";
import { getDashboardStats } from "@/app/actions/files";
import { getFolderContents, getFolderTree } from "@/app/actions/folders";
import { FilesDashboard } from "@/components/files/FilesDashboard";
import { folderIdSchema } from "@/lib/folder-validation";

export const instant = false;

type DashboardPageProps = {
  searchParams: Promise<{ folder?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const folderId = folderIdSchema.safeParse(params.folder).success
    ? params.folder ?? null
    : null;
  const [contents, stats, folderTree] = await Promise.all([
    getFolderContents({ folderId, query: "", sort: "newest", page: 1 }),
    getDashboardStats(),
    getFolderTree(),
  ]);

  if (folderId && !contents.folder) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }

  return (
    <FilesDashboard
      key={folderId ?? "root"}
      initialFiles={contents.files}
      initialFolders={contents.folders}
      initialBreadcrumbs={contents.breadcrumbs}
      initialFolderTree={folderTree}
      currentFolderId={folderId}
      currentFolderName={contents.folder?.name ?? null}
      initialStats={stats}
      initialTotal={contents.totalFiles}
      initialFolderTotal={contents.totalFolders}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
      userName={user.name}
    />
  );
}