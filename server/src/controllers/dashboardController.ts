import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { getCurrentUserId } from "../services/currentUser";

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getStats(req: Request, res: Response) {
  const userId = await getCurrentUserId();
  const now = new Date();

  const [allShares, allOpens] = await Promise.all([
    prisma.share.findMany({ where: { createdBy: userId }, select: { status: true, expiresAt: true, createdAt: true } }),
    prisma.shareOpen.findMany({
      where: { share: { createdBy: userId } },
      select: { openedAt: true, deviceType: true, visitorHash: true },
    }),
  ]);

  const totalShares = allShares.length;
  const revokedShares = allShares.filter((s) => s.status === "revoked").length;
  const activeShares = allShares.filter((s) => s.status !== "revoked" && s.expiresAt > now).length;
  const expiredShares = allShares.filter((s) => s.status !== "revoked" && s.expiresAt <= now).length;
  const totalOpens = allOpens.length;
  const uniqueVisitors = new Set(allOpens.map((o) => o.visitorHash)).size;

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const sharesThisMonth = allShares.filter((s) => s.createdAt >= startOfThisMonth).length;
  const sharesLastMonth = allShares.filter((s) => s.createdAt >= startOfLastMonth && s.createdAt < startOfThisMonth).length;
  const opensThisMonth = allOpens.filter((o) => o.openedAt >= startOfThisMonth).length;
  const opensLastMonth = allOpens.filter((o) => o.openedAt >= startOfLastMonth && o.openedAt < startOfThisMonth).length;

  const range = Number(req.query.range) || 7;
  const days = [7, 30, 90].includes(range) ? range : 7;
  const chart = buildDailySeries(allShares.map((s) => s.createdAt), days);

  const deviceCounts: Record<string, number> = {};
  for (const o of allOpens) {
    deviceCounts[o.deviceType] = (deviceCounts[o.deviceType] || 0) + 1;
  }
  const deviceBreakdown = Object.entries(deviceCounts).map(([device, count]) => ({
    device,
    count,
    percent: totalOpens ? Math.round((count / totalOpens) * 100) : 0,
  }));

  res.json({
    totalShares,
    activeShares,
    expiredShares,
    revokedShares,
    totalOpens,
    uniqueVisitors,
    trends: {
      shares: percentChange(sharesThisMonth, sharesLastMonth),
      opens: percentChange(opensThisMonth, opensLastMonth),
    },
    shareActivity: chart,
    deviceBreakdown,
  });
}

function buildDailySeries(dates: Date[], days: number) {
  const series: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    series.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const index = new Map(series.map((b) => [b.date, b]));
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10);
    const bucket = index.get(key);
    if (bucket) bucket.count += 1;
  }
  return series;
}
