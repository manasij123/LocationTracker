import { prisma } from "../prisma";

const DEFAULT_RETENTION_DAYS = 60;

function retentionDays(): number {
  const parsed = Number(process.env.LIVE_TRACK_RETENTION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

/**
 * A live share's GPS trail is meant as a safety record — if something happens, it should
 * still be there hours or days later, not silently expire like a normal share. But keeping
 * every point forever isn't the point either: past the retention window, whatever the trail
 * could have been useful for has long since been resolved one way or another, so old points
 * are purged rather than accumulating indefinitely. Deletes LiveTrackPoint rows only, never
 * the Share itself.
 */
export async function cleanupOldLiveTrackPoints() {
  const cutoff = new Date(Date.now() - retentionDays() * 24 * 60 * 60_000);
  const result = await prisma.liveTrackPoint.deleteMany({
    where: { recordedAt: { lt: cutoff } },
  });
  return result.count;
}

export function startLiveTrackRetentionJob(intervalMs = 24 * 60 * 60_000) {
  cleanupOldLiveTrackPoints().catch((err) => console.error("Live track cleanup failed:", err));
  const timer = setInterval(() => {
    cleanupOldLiveTrackPoints().catch((err) => console.error("Live track cleanup failed:", err));
  }, intervalMs);
  return () => clearInterval(timer);
}
