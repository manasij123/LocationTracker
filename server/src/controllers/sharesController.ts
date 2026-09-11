import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { ApiError } from "../middleware/errorHandler";
import { getCurrentUserId } from "../services/currentUser";
import { computeStatus, msRemaining } from "../services/expiration";
import { createPublicToken, classifyDevice, hashVisitor } from "../utils/token";
import {
  createShareSchema,
  shareListQuerySchema,
  openShareSchema,
  updateLocationSchema,
  startLiveShareSchema,
  livePingSchema,
} from "../utils/validation";

const MAX_TOKEN_ATTEMPTS = 5;

async function generateUniqueToken(): Promise<string> {
  for (let i = 0; i < MAX_TOKEN_ATTEMPTS; i++) {
    const token = createPublicToken();
    const existing = await prisma.share.findUnique({ where: { publicToken: token } });
    if (!existing) return token;
  }
  throw new ApiError(500, "Could not generate a unique share link. Please try again.");
}

export async function createShare(req: Request, res: Response) {
  const data = createShareSchema.parse(req.body);
  const userId = await getCurrentUserId();

  const expiresAt = data.expiresAt
    ? new Date(data.expiresAt)
    : new Date(Date.now() + (data.durationMinutes as number) * 60_000);

  if (expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, "Expiration time must be in the future.");
  }

  const publicToken = await generateUniqueToken();

  const share = await prisma.share.create({
    data: {
      publicToken,
      placeName: data.placeName,
      formattedAddress: data.formattedAddress,
      latitude: data.latitude,
      longitude: data.longitude,
      providerPlaceId: data.providerPlaceId || null,
      note: data.note || null,
      expiresAt,
      createdBy: userId,
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      shareId: share.id,
      type: "share_created",
      metadata: { placeName: share.placeName },
    },
  });

  res.status(201).json({ share: creatorShareDto(share, 0) });
}

export async function listShares(req: Request, res: Response) {
  const { status, search, sort } = shareListQuerySchema.parse(req.query);
  const userId = await getCurrentUserId();

  const shares = await prisma.share.findMany({
    where: {
      createdBy: userId,
      ...(search
        ? {
            OR: [
              { placeName: { contains: search, mode: "insensitive" } },
              { formattedAddress: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { opens: true } } },
    orderBy: { createdAt: "desc" },
  });

  let mapped = shares.map((s) => creatorShareDto(s, s._count.opens));

  if (status && status !== "all") {
    mapped = mapped.filter((s) => s.status === status);
  }

  if (sort === "oldest") {
    mapped = [...mapped].reverse();
  } else if (sort === "most_opened") {
    mapped = [...mapped].sort((a, b) => b.linkOpens - a.linkOpens);
  }

  res.json({ shares: mapped });
}

export async function getPublicShare(req: Request, res: Response) {
  const { shareId } = req.params;
  const share = await prisma.share.findUnique({
    where: { publicToken: shareId },
    include: {
      locationHistory: { orderBy: { createdAt: "asc" } },
      liveTrackPoints: { orderBy: { recordedAt: "asc" } },
    },
  });
  if (!share) throw new ApiError(404, "This share link is invalid.");

  res.json({
    share: publicShareDto(share, share.locationHistory, share.liveTrackPoints),
    serverTime: new Date().toISOString(),
  });
}

export async function revokeShare(req: Request, res: Response) {
  const { shareId } = req.params;
  const userId = await getCurrentUserId();

  const share = await prisma.share.findUnique({ where: { publicToken: shareId } });
  if (!share) throw new ApiError(404, "Share not found.");
  if (share.createdBy !== userId) throw new ApiError(403, "You cannot revoke this share.");

  const status = computeStatus(share);
  if (status !== "active") {
    throw new ApiError(400, `This share is already ${status}.`);
  }

  const updated = await prisma.share.update({
    where: { id: share.id },
    data: { status: "revoked", revokedAt: new Date() },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      shareId: share.id,
      type: "share_revoked",
      metadata: { placeName: share.placeName },
    },
  });

  res.json({ share: creatorShareDto(updated, 0) });
}

export async function updateLocation(req: Request, res: Response) {
  const { shareId } = req.params;
  const data = updateLocationSchema.parse(req.body);
  const userId = await getCurrentUserId();

  const share = await prisma.share.findUnique({ where: { publicToken: shareId } });
  if (!share) throw new ApiError(404, "Share not found.");
  if (share.createdBy !== userId) throw new ApiError(403, "You cannot update this share.");

  const status = computeStatus(share);
  if (status !== "active") {
    throw new ApiError(400, `Can't update location on a share that is ${status}.`);
  }

  // If the previous move's real travel time hadn't fully elapsed yet, the client resolves and
  // sends where the creator realistically was just now, so the trail reflects the actual path
  // rather than a destination that, in real-world terms, was never actually reached.
  const hasCorrectedDeparture = data.fromLatitude != null && data.fromLongitude != null;

  await prisma.locationHistory.create({
    data: {
      shareId: share.id,
      placeName: share.placeName,
      formattedAddress: share.formattedAddress,
      latitude: hasCorrectedDeparture ? (data.fromLatitude as number) : share.latitude,
      longitude: hasCorrectedDeparture ? (data.fromLongitude as number) : share.longitude,
      travelDurationSeconds: data.travelDurationSeconds ?? null,
      travelMode: data.travelMode ?? null,
    },
  });

  const updated = await prisma.share.update({
    where: { id: share.id },
    data: {
      placeName: data.placeName,
      formattedAddress: data.formattedAddress,
      latitude: data.latitude,
      longitude: data.longitude,
      providerPlaceId: data.providerPlaceId || null,
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      shareId: share.id,
      type: "location_updated",
      metadata: { placeName: updated.placeName, previousPlaceName: share.placeName },
    },
  });

  res.json({ share: creatorShareDto(updated, 0) });
}

export async function startLiveShare(req: Request, res: Response) {
  const data = startLiveShareSchema.parse(req.body);
  const userId = await getCurrentUserId();

  const publicToken = await generateUniqueToken();
  // Safety-net expiry in case the creator forgets to hit "Stop sharing" (or just closes the
  // tab) — far longer than any real live-sharing session should run; "stop" is what normally
  // ends it, via the existing revoke endpoint.
  const expiresAt = new Date(Date.now() + 12 * 60 * 60_000);

  const share = await prisma.share.create({
    data: {
      publicToken,
      placeName: "Live Location",
      formattedAddress: "Live location — updates in real time",
      latitude: data.latitude,
      longitude: data.longitude,
      isLive: true,
      expiresAt,
      createdBy: userId,
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      shareId: share.id,
      type: "share_created",
      metadata: { placeName: share.placeName, isLive: true },
    },
  });

  res.status(201).json({ share: creatorShareDto(share, 0) });
}

export async function postLivePing(req: Request, res: Response) {
  const { shareId } = req.params;
  const data = livePingSchema.parse(req.body);
  const userId = await getCurrentUserId();

  const share = await prisma.share.findUnique({ where: { publicToken: shareId } });
  if (!share) throw new ApiError(404, "Share not found.");
  if (share.createdBy !== userId) throw new ApiError(403, "You cannot update this share.");
  if (!share.isLive) throw new ApiError(400, "This share is not a live-tracking share.");

  const status = computeStatus(share);
  if (status !== "active") {
    throw new ApiError(400, `Can't record a location ping on a share that is ${status}.`);
  }

  let waitPointLabel: number | null = null;
  if (data.isWaitPoint) {
    const priorWaitPoints = await prisma.liveTrackPoint.count({
      where: { shareId: share.id, waitPointLabel: { not: null } },
    });
    waitPointLabel = priorWaitPoints + 1;
  }

  await prisma.liveTrackPoint.create({
    data: {
      shareId: share.id,
      latitude: data.latitude,
      longitude: data.longitude,
      waitPointLabel,
    },
  });

  const updated = await prisma.share.update({
    where: { id: share.id },
    data: { latitude: data.latitude, longitude: data.longitude },
  });

  res.status(201).json({ share: creatorShareDto(updated, 0), waitPointLabel });
}

export async function getAnalytics(req: Request, res: Response) {
  const { shareId } = req.params;
  const userId = await getCurrentUserId();

  const share = await prisma.share.findUnique({
    where: { publicToken: shareId },
    include: {
      locationHistory: { orderBy: { createdAt: "asc" } },
      liveTrackPoints: { orderBy: { recordedAt: "asc" } },
    },
  });
  if (!share) throw new ApiError(404, "Share not found.");
  if (share.createdBy !== userId) throw new ApiError(403, "You cannot view this analytics.");

  const opens = await prisma.shareOpen.findMany({
    where: { shareId: share.id },
    orderBy: { openedAt: "desc" },
  });

  const totalOpens = opens.length;
  const uniqueVisitors = new Set(opens.map((o) => o.visitorHash)).size;
  const lastOpened = opens[0]?.openedAt ?? null;

  const deviceCounts: Record<string, number> = {};
  for (const o of opens) {
    deviceCounts[o.deviceType] = (deviceCounts[o.deviceType] || 0) + 1;
  }
  const deviceBreakdown = Object.entries(deviceCounts).map(([device, count]) => ({
    device,
    count,
    percent: totalOpens ? Math.round((count / totalOpens) * 100) : 0,
  }));

  const dailyBuckets = buildDailyBuckets(opens.map((o) => o.openedAt), 14);

  res.json({
    share: creatorShareDto(share, totalOpens, share.locationHistory, share.liveTrackPoints),
    totalOpens,
    uniqueVisitors,
    lastOpened,
    deviceBreakdown,
    dailyOpens: dailyBuckets,
    recentOpens: opens.slice(0, 10).map((o) => ({
      openedAt: o.openedAt,
      deviceType: o.deviceType,
    })),
  });
}

export async function recordOpen(req: Request, res: Response) {
  const { shareId } = req.params;
  const body = openShareSchema.parse(req.body || {});

  const share = await prisma.share.findUnique({ where: { publicToken: shareId } });
  if (!share) throw new ApiError(404, "This share link is invalid.");

  const status = computeStatus(share);
  const userAgent = req.get("user-agent") || "";
  const ip = req.ip || "unknown";

  if (status === "active") {
    const visitorHash = hashVisitor(share.id, ip, userAgent);
    const deviceType = classifyDevice(userAgent);

    await prisma.shareOpen.create({
      data: {
        shareId: share.id,
        visitorHash,
        deviceType,
        userAgentCategory: body.userAgentCategory || deviceType,
      },
    });

    await prisma.activityEvent.create({
      data: {
        userId: share.createdBy,
        shareId: share.id,
        type: "link_opened",
        metadata: { placeName: share.placeName },
      },
    });
  }

  res.status(201).json({ recorded: status === "active", status });
}

function buildDailyBuckets(dates: Date[], days: number) {
  const buckets: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ date: key, count: 0 });
  }
  const index = new Map(buckets.map((b) => [b.date, b]));
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10);
    const bucket = index.get(key);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

type ShareRow = {
  id: string;
  publicToken: string;
  placeName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  providerPlaceId: string | null;
  note: string | null;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  isLive: boolean;
};

type LocationHistoryRow = {
  placeName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  travelDurationSeconds: number | null;
  travelMode: string | null;
};

type LiveTrackPointRow = {
  latitude: number;
  longitude: number;
  recordedAt: Date;
  waitPointLabel: number | null;
};

function historyDto(history: LocationHistoryRow[]) {
  return history.map((h) => ({
    placeName: h.placeName,
    formattedAddress: h.formattedAddress,
    latitude: h.latitude,
    longitude: h.longitude,
    updatedAt: h.createdAt,
    travelDurationSeconds: h.travelDurationSeconds,
    travelMode: h.travelMode,
  }));
}

function liveTrackDto(points: LiveTrackPointRow[]) {
  return points.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    recordedAt: p.recordedAt,
    waitPointLabel: p.waitPointLabel,
  }));
}

export function creatorShareDto(
  share: ShareRow,
  linkOpens: number,
  history?: LocationHistoryRow[],
  liveTrack?: LiveTrackPointRow[]
) {
  const status = computeStatus(share as any);
  return {
    id: share.publicToken,
    placeName: share.placeName,
    formattedAddress: share.formattedAddress,
    latitude: share.latitude,
    longitude: share.longitude,
    note: share.note,
    status,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    remainingMs: status === "active" ? msRemaining(share as any) : 0,
    linkOpens,
    shareUrl: `/share/${share.publicToken}`,
    isLive: share.isLive,
    locationHistory: history ? historyDto(history) : [],
    liveTrack: liveTrack ? liveTrackDto(liveTrack) : [],
  };
}

export function publicShareDto(share: ShareRow, history?: LocationHistoryRow[], liveTrack?: LiveTrackPointRow[]) {
  const status = computeStatus(share as any);
  const base = {
    id: share.publicToken,
    placeName: share.placeName,
    formattedAddress: share.formattedAddress,
    status,
    expiresAt: share.expiresAt,
    isLive: share.isLive,
  };
  if (status !== "active") {
    return base;
  }
  return {
    ...base,
    latitude: share.latitude,
    longitude: share.longitude,
    note: share.note,
    remainingMs: msRemaining(share as any),
    locationHistory: historyDto(history || []),
    liveTrack: liveTrackDto(liveTrack || []),
  };
}
