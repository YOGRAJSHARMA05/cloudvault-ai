import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { ChatWorkspace } from "@/components/ai/ChatWorkspace";

export const instant = false;

const CHAT_EXTENSIONS = [
  "pdf",
  "docx",
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "swift",
  "kt",
  "sh",
  "sql",
  "html",
  "css",
  "scss",
  "yml",
  "yaml",
  "xml",
  "toml",
  "ini",
];

export default async function ChatPage() {
  const user = await requireUser();

  const files = await prisma.file.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      extension: { in: CHAT_EXTENSIONS },
    },
    select: { id: true, originalName: true, extension: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <WorkspaceShell
      description="Ask questions across your PDFs, Word documents, text, Markdown, and code. Answers stream back with citations to the sections used."
      title="AI chat"
    >
      <ChatWorkspace files={files} />
    </WorkspaceShell>
  );
}
