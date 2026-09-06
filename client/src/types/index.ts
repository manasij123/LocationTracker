export type ShareStatus = "active" | "expired" | "revoked";
export type DeviceType = "android" | "ios" | "desktop" | "other";

export interface PlaceResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

export interface Share {
  id: string;
  placeName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  note: string | null;
  status: ShareStatus;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  remainingMs: number;
  linkOpens: number;
  shareUrl: string;
}

export interface PublicShare {
  id: string;
  placeName: string;
  formattedAddress: string;
  status: ShareStatus;
  expiresAt: string;
  latitude?: number;
  longitude?: number;
  note?: string | null;
  remainingMs?: number;
}

export interface DeviceBreakdownEntry {
  device: string;
  count: number;
  percent: number;
}

export interface DailyPoint {
  date: string;
  count: number;
}

export interface ShareAnalytics {
  share: Share;
  totalOpens: number;
  uniqueVisitors: number;
  lastOpened: string | null;
  deviceBreakdown: DeviceBreakdownEntry[];
  dailyOpens: DailyPoint[];
  recentOpens: { openedAt: string; deviceType: DeviceType }[];
}

export type ActivityType = "share_created" | "link_opened" | "share_expired" | "share_revoked";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  createdAt: string;
  placeName: string | null;
  shareId: string | null;
}

export interface DashboardStats {
  totalShares: number;
  activeShares: number;
  expiredShares: number;
  revokedShares: number;
  totalOpens: number;
  uniqueVisitors: number;
  trends: { shares: number; opens: number };
  shareActivity: DailyPoint[];
  deviceBreakdown: DeviceBreakdownEntry[];
}
