import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { getCurrentUserId } from "../services/currentUser";
import { activityQuerySchema } from "../utils/validation";

const typeFilterMap: Record<string, string[]> = {
  shares: ["share_created", "location_updated"],
  opens: ["link_opened"],
  expired: ["share_expired"],
  revoked: ["share_revoked"],
};

export async function getActivity(req: Request, res: Response) {
  const { type, limit } = activityQuerySchema.parse(req.query);
  const userId = await getCurrentUserId();

  const events = await prisma.activityEvent.findMany({
    where: {
      userId,
      ...(type && type !== "all" ? { type: { in: typeFilterMap[type] as any } } : {}),
    },
    include: { share: true },
    orderBy: { createdAt: "desc" },
    take: limit || 100,
  });

  res.json({
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      createdAt: e.createdAt,
      placeName: e.share?.placeName ?? (e.metadata as any)?.placeName ?? null,
      shareId: e.share?.publicToken ?? null,
      metadata: e.metadata,
    })),
  });
}
