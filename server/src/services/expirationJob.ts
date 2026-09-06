import { prisma } from "../prisma";

/**
 * Status is always computed live from expiresAt (see services/expiration.ts), so this
 * job is not required for correctness. It exists to keep the stored `status` column in
 * sync for simpler ad-hoc DB queries/reporting, and to emit share_expired activity events.
 */
export async function sweepExpiredShares() {
  const now = new Date();
  const toExpire = await prisma.share.findMany({
    where: { status: "active", expiresAt: { lte: now } },
    select: { id: true, createdBy: true, placeName: true },
  });

  if (toExpire.length === 0) return;

  await prisma.$transaction([
    prisma.share.updateMany({
      where: { id: { in: toExpire.map((s) => s.id) } },
      data: { status: "expired" },
    }),
    prisma.activityEvent.createMany({
      data: toExpire.map((s) => ({
        userId: s.createdBy,
        shareId: s.id,
        type: "share_expired" as const,
        metadata: { placeName: s.placeName },
      })),
    }),
  ]);
}

export function startExpirationJob(intervalMs = 60_000) {
  const timer = setInterval(() => {
    sweepExpiredShares().catch((err) => console.error("Expiration sweep failed:", err));
  }, intervalMs);
  return () => clearInterval(timer);
}
