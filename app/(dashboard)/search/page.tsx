import { requireUser } from "@/lib/auth-guard";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { SemanticSearchClient } from "@/components/search/SemanticSearchClient";

export const instant = false;

export default async function SearchPage() {
  await requireUser();

  return (
    <WorkspaceShell
      description="Search across your workspace by meaning, topic, and document content using AI embeddings."
      title="AI search"
    >
      <SemanticSearchClient />
    </WorkspaceShell>
  );
}
