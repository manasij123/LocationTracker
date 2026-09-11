import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../prisma";
import { getCurrentUserId } from "../services/currentUser";
import { cleanupOldLiveTrackPoints } from "../services/liveTrackRetention";

describe("live track retention", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes only live-track points older than the retention window", async () => {
    const userId = await getCurrentUserId();
    const share = await prisma.share.create({
      data: {
        publicToken: `retention-test-${Date.now()}`,
        placeName: "Live Location",
        formattedAddress: "Live location — updates in real time",
        latitude: 22.5,
        longitude: 88.3,
        isLive: true,
        expiresAt: new Date(Date.now() + 60_000),
        createdBy: userId,
      },
    });

    const oldPoint = await prisma.liveTrackPoint.create({
      data: {
        shareId: share.id,
        latitude: 22.5,
        longitude: 88.3,
        recordedAt: new Date(Date.now() - 90 * 24 * 60 * 60_000), // 90 days old
      },
    });
    const recentPoint = await prisma.liveTrackPoint.create({
      data: {
        shareId: share.id,
        latitude: 22.51,
        longitude: 88.31,
        recordedAt: new Date(),
      },
    });

    const deletedCount = await cleanupOldLiveTrackPoints();
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.liveTrackPoint.findMany({ where: { shareId: share.id } });
    expect(remaining.map((p) => p.id)).not.toContain(oldPoint.id);
    expect(remaining.map((p) => p.id)).toContain(recentPoint.id);

    await prisma.share.delete({ where: { id: share.id } });
  });
});
