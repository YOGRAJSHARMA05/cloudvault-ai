export type FileRecordView = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: string;
  folder: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FileListResult = {
  files: FileRecordView[];
  total: number;
};

export type FileActionResult<T = undefined> = {
  success: boolean;
  message: string;
  data?: T;
};

export type DashboardStats = {
  totalBytes: string;
  totalFiles: number;
  favoriteFiles: number;
  averageBytes: string;
};