export type ShareLinkStatus =
  | "active"
  | "expired"
  | "revoked"
  | "exhausted"
  | "file-missing";

export type ShareLinkView = {
  id: string;
  token: string;
  label: string | null;
  fileId: string;
  fileName: string;
  fileExtension: string;
  fileSize: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  maxViews: number | null;
  viewCount: number;
  passwordProtected: boolean;
  status: ShareLinkStatus;
};

export type ShareFileOption = {
  id: string;
  originalName: string;
  extension: string;
  size: string;
};

export type CreatedShareLink = {
  id: string;
  token: string;
  path: string;
};
