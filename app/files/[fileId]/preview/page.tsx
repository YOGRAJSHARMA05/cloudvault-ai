import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { FilePreviewClient } from "@/components/files/preview/FilePreviewClient";

export const instant = false;

type PreviewPageProps = {
  params: Promise<{ fileId: string }>;
};

export default async function FilePreviewPage({ params }: PreviewPageProps) {
  const user = await requireUser();
  const { fileId } = await params;

  const file = await prisma.file.findFirst({
    where: { id: fileId, userId: user.id },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      extension: true,
      size: true,
      folder: true,
      createdAt: true,
      updatedAt: true,
      folderId: true,
      parentFolder: { select: { name: true } },
    },
  });

  if (!file) {
    notFound();
  }

  return (
    <FilePreviewClient
      file={{
        ...file,
        size: file.size.toString(),
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
        folderName: file.parentFolder?.name ?? file.folder ?? "/",
      }}
    />
  );
}
