import type { Share, ShareStatus } from "@prisma/client";

/**
 * The single source of truth for whether a share is active. Statuses are lazily
 * computed from server time rather than trusted from the stored column, since a
 * background job may not have run yet.
 */
export function computeStatus(share: Pick<Share, "status" | "expiresAt" | "revokedAt">): ShareStatus {
  if (share.status === "revoked" || share.revokedAt) return "revoked";
  if (share.expiresAt.getTime() <= Date.now()) return "expired";
  return "active";
}

export function msRemaining(share: Pick<Share, "expiresAt">): number {
  return Math.max(0, share.expiresAt.getTime() - Date.now());
}
