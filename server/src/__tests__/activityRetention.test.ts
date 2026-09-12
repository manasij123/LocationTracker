import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../prisma";
import { getCurrentUserId } from "../services/currentUser";
import { cleanupOldActivityEvents } from "../services/activityRetention";

describe("activity retention", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes only activity events older than the retention window", async () => {
    const userId = await getCurrentUserId();

    const oldEvent = await prisma.activityEvent.create({
      data: {
        userId,
        type: "share_created",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60_000), // 30 days old
      },
    });
    const recentEvent = await prisma.activityEvent.create({
      data: {
        userId,
        type: "share_created",
        createdAt: new Date(),
      },
    });

    const deletedCount = await cleanupOldActivityEvents();
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.activityEvent.findMany({ where: { userId } });
    expect(remaining.map((e) => e.id)).not.toContain(oldEvent.id);
    expect(remaining.map((e) => e.id)).toContain(recentEvent.id);

    await prisma.activityEvent.delete({ where: { id: recentEvent.id } });
  });
});
