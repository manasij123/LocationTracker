import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";

const prisma = new PrismaClient();
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const token = customAlphabet(alphabet, 8);

async function main() {
  const email = process.env.DEMO_USER_EMAIL || "demo@spotshare.app";
  const name = process.env.DEMO_USER_NAME || "Demo User";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name },
  });

  const places = [
    { placeName: "TCS Gitobitan", formattedAddress: "TCS Gitobitan, Sector V, Salt Lake, Kolkata, West Bengal 700091", latitude: 22.5744, longitude: 88.4331 },
    { placeName: "Park Street", formattedAddress: "Park Street, Kolkata, West Bengal 700016", latitude: 22.5535, longitude: 88.3517 },
    { placeName: "Salt Lake", formattedAddress: "Bidhannagar, Salt Lake, Kolkata, West Bengal 700064", latitude: 22.5809, longitude: 88.4171 },
    { placeName: "Victoria Memorial", formattedAddress: "1, Queens Way, Maidan, Kolkata, West Bengal 700071", latitude: 22.5448, longitude: 88.3426 },
  ];

  const now = Date.now();

  const seedShares = [
    { place: places[0], offsetMs: -2 * 60_000, durationMs: 2 * 60 * 60_000, note: "Come near the main gate.", status: "active" as const },
    { place: places[1], offsetMs: -26 * 60 * 60_000, durationMs: 2 * 60 * 60_000, note: null, status: "expired" as const },
    { place: places[2], offsetMs: -60 * 60_000, durationMs: 30 * 60_000, note: "Look for the blue gate near the market.", status: "revoked" as const },
    { place: places[3], offsetMs: -10 * 24 * 60 * 60_000, durationMs: 60 * 60_000, note: null, status: "expired" as const },
  ];

  for (const seed of seedShares) {
    const createdAt = new Date(now + seed.offsetMs);
    const expiresAt = new Date(createdAt.getTime() + seed.durationMs);

    const share = await prisma.share.create({
      data: {
        publicToken: token(),
        placeName: seed.place.placeName,
        formattedAddress: seed.place.formattedAddress,
        latitude: seed.place.latitude,
        longitude: seed.place.longitude,
        note: seed.note,
        createdAt,
        expiresAt,
        status: seed.status === "revoked" ? "revoked" : seed.status === "expired" ? "expired" : "active",
        revokedAt: seed.status === "revoked" ? new Date(createdAt.getTime() + 20 * 60_000) : null,
        createdBy: user.id,
      },
    });

    await prisma.activityEvent.create({
      data: { userId: user.id, shareId: share.id, type: "share_created", createdAt, metadata: { placeName: share.placeName } },
    });

    const openCount = seed.status === "active" ? 6 : seed.status === "expired" ? 14 : 2;
    for (let i = 0; i < openCount; i++) {
      const openedAt = new Date(createdAt.getTime() + (i + 1) * 4 * 60_000);
      const deviceType = i % 3 === 0 ? "ios" : i % 3 === 1 ? "android" : "desktop";
      await prisma.shareOpen.create({
        data: {
          shareId: share.id,
          openedAt,
          visitorHash: `seed-${share.id}-${i}`,
          deviceType,
          userAgentCategory: deviceType,
        },
      });
      await prisma.activityEvent.create({
        data: { userId: user.id, shareId: share.id, type: "link_opened", createdAt: openedAt, metadata: { placeName: share.placeName } },
      });
    }

    if (seed.status === "expired") {
      await prisma.activityEvent.create({
        data: { userId: user.id, shareId: share.id, type: "share_expired", createdAt: expiresAt, metadata: { placeName: share.placeName } },
      });
    }
    if (seed.status === "revoked") {
      await prisma.activityEvent.create({
        data: { userId: user.id, shareId: share.id, type: "share_revoked", createdAt: share.revokedAt!, metadata: { placeName: share.placeName } },
      });
    }
  }

  console.log(`Seeded demo user ${email} with ${seedShares.length} shares.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
