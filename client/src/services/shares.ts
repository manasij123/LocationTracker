import { api } from "./api";
import type { Share, PublicShare, ShareAnalytics } from "../types";

export interface CreateSharePayload {
  placeName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  providerPlaceId?: string | null;
  note?: string | null;
  durationMinutes?: number;
  expiresAt?: string;
}

export function createShare(payload: CreateSharePayload) {
  return api.post<{ share: Share }>("/shares", payload);
}

export function listShares(params: { status?: string; search?: string; sort?: string } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.sort) query.set("sort", params.sort);
  const qs = query.toString();
  return api.get<{ shares: Share[] }>(`/shares${qs ? `?${qs}` : ""}`);
}

export function getPublicShare(shareId: string) {
  return api.get<{ share: PublicShare; serverTime: string }>(`/shares/${shareId}`);
}

export function revokeShare(shareId: string) {
  return api.post<{ share: Share }>(`/shares/${shareId}/revoke`);
}

export interface UpdateLocationPayload {
  placeName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  providerPlaceId?: string | null;
  /** Optional creator-supplied travel time (seconds) for this move, used instead of the
   *  auto-estimated Google Maps duration when animating the transition. */
  travelDurationSeconds?: number;
  /** Optional creator-chosen travel mode for this move — picks which route/path to animate
   *  along instead of auto-detecting (transit, else driving). */
  travelMode?: "driving" | "walking" | "bicycling" | "transit";
  /** Optional corrected departure point — where the creator realistically was just now, if the
   *  previous move's real travel time hadn't fully elapsed yet, instead of the share's last
   *  recorded (not-yet-actually-reached) position. Both or neither. */
  fromLatitude?: number;
  fromLongitude?: number;
}

export function updateShareLocation(shareId: string, payload: UpdateLocationPayload) {
  return api.post<{ share: Share }>(`/shares/${shareId}/location`, payload);
}

export function getShareAnalytics(shareId: string) {
  return api.get<ShareAnalytics>(`/shares/${shareId}/analytics`);
}

export function startLiveShare(payload: { latitude: number; longitude: number }) {
  return api.post<{ share: Share }>("/shares/live", payload);
}

export function sendLivePing(
  shareId: string,
  payload: { latitude: number; longitude: number; isWaitPoint?: boolean }
) {
  return api.post<{ share: Share; waitPointLabel: number | null }>(`/shares/${shareId}/live-ping`, payload);
}

export function recordShareOpen(shareId: string) {
  // The server already derives the device category from the request's real User-Agent header
  // (see classifyDevice() in sharesController.ts) — no need to send it, and doing so previously
  // sent the full navigator.userAgent string, which routinely exceeds the 100-char limit the
  // server validates against and made this call fail with a 400 on every single open.
  return api.post<{ recorded: boolean; status: string }>(`/shares/${shareId}/open`, {});
}
