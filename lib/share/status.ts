export type ShareUnavailableReason =
  | "revoked"
  | "expired"
  | "exhausted"
  | "deleted"
  | "missing";

export type ShareAvailability =
  | { valid: true }
  | { valid: false; reason: ShareUnavailableReason };

type ShareState = {
  revokedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  maxViews?: number | null;
  viewCount?: number;
  file?: { deletedAt?: Date | string | null } | null;
};

export function getShareAvailability(link: ShareState | null): ShareAvailability {
  if (!link) return { valid: false, reason: "missing" };
  if (link.revokedAt) return { valid: false, reason: "revoked" };
  if (link.file && link.file.deletedAt) return { valid: false, reason: "deleted" };
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return { valid: false, reason: "expired" };
  }
  if (
    link.maxViews !== null &&
    link.maxViews !== undefined &&
    (link.viewCount ?? 0) >= link.maxViews
  ) {
    return { valid: false, reason: "exhausted" };
  }
  return { valid: true };
}

export function shareUnavailableMessage(reason: ShareUnavailableReason): string {
  switch (reason) {
    case "revoked":
      return "This share link has been disabled by its owner.";
    case "expired":
      return "This share link has expired.";
    case "exhausted":
      return "This share link has reached its maximum number of views.";
    case "deleted":
      return "The shared file is no longer available.";
    default:
      return "This share link could not be found.";
  }
}
