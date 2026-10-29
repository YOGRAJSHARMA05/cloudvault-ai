import { getTrashContents } from "@/app/actions/trash";
import { requireUser } from "@/lib/auth-guard";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { TrashClient } from "@/components/trash/TrashClient";

export const instant = false;

export default async function TrashPage() {
  await requireUser();
  const contents = await getTrashContents();

  return (
    <WorkspaceShell
      description="Deleted files and folders stay here until you restore them or remove them permanently."
      title="Trash"
    >
      <TrashClient initialContents={contents} />
    </WorkspaceShell>
  );
}
