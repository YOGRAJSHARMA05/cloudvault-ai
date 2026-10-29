import type { FolderView } from "@/types/folders";

export type TrashedFileView = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: string;
  folderName: string;
  deletedAt: string;
  createdAt: string;
};

export type TrashedFolderView = FolderView & {
  deletedAt: string;
  parentFolderId: string | null;
};

export type TrashContents = {
  files: TrashedFileView[];
  folders: TrashedFolderView[];
  totalBytes: string;
};
