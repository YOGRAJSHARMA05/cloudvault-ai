import type { FileRecordView } from "@/types/files";

export type FolderView = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
  childCount: number;
  fileCount: number;
};

export type FolderTreeNode = FolderView & {
  children: FolderTreeNode[];
};

export type FolderBreadcrumb = Pick<FolderView, "id" | "name">;

export type FolderContents = {
  folder: FolderView | null;
  folders: FolderView[];
  files: FileRecordView[];
  breadcrumbs: FolderBreadcrumb[];
  totalFolders: number;
  totalFiles: number;
};

export type WorkspaceSearchResults = {
  folders: FolderView[];
  files: FileRecordView[];
  totalFolders: number;
  totalFiles: number;
};