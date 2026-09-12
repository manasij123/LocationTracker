import { prisma } from "../prisma";

const DEFAULT_RETENTION_DAYS = 7;

function retentionDays(): number {
  const parsed = Number(process.env.ACTIVITY_RETENTION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

/**
 * The activity feed is a rolling "what happened recently" log, not a permanent audit trail —
 * unlike a live share's GPS trail (see liveTrackRetention.ts), there's no safety reason to keep
 * it around, and it otherwise grows forever (every share, link open, and location update adds a
 * row). Past the retention window, old rows are purged so the table doesn't accumulate
 * indefinitely. Only ever deletes ActivityEvent rows — never a Share or its own history.
 */
export async function cleanupOldActivityEvents() {
  const cutoff = new Date(Date.now() - retentionDays() * 24 * 60 * 60_000);
  const result = await prisma.activityEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

export function startActivityRetentionJob(intervalMs = 24 * 60 * 60_000) {
  cleanupOldActivityEvents().catch((err) => console.error("Activity cleanup failed:", err));
  const timer = setInterval(() => {
    cleanupOldActivityEvents().catch((err) => console.error("Activity cleanup failed:", err));
  }, intervalMs);
  return () => clearInterval(timer);
}
