import { getShareFileOptions, listShareLinks } from "@/app/actions/share";
import { requireUser } from "@/lib/auth-guard";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { ShareManager } from "@/components/share/ShareManager";

export const instant = false;

type SharePageProps = {
  searchParams: Promise<{ file?: string }>;
};

export default async function ShareManagementPage({ searchParams }: SharePageProps) {
  await requireUser();
  const params = await searchParams;
  const [links, fileOptions] = await Promise.all([
    listShareLinks(),
    getShareFileOptions(),
  ]);
  const initialFileId =
    params.file && fileOptions.some((file) => file.id === params.file)
      ? params.file
      : null;

  return (
    <WorkspaceShell
      description="Create password-protected, expiring links to files in your workspace and revoke access at any time."
      title="Shared links"
    >
      <ShareManager
        fileOptions={fileOptions}
        initialFileId={initialFileId}
        initialLinks={links}
      />
    </WorkspaceShell>
  );
}
