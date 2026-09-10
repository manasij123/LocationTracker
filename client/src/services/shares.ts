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
}

export function updateShareLocation(shareId: string, payload: UpdateLocationPayload) {
  return api.post<{ share: Share }>(`/shares/${shareId}/location`, payload);
}

export function getShareAnalytics(shareId: string) {
  return api.get<ShareAnalytics>(`/shares/${shareId}/analytics`);
}

export function recordShareOpen(shareId: string) {
  return api.post<{ recorded: boolean; status: string }>(`/shares/${shareId}/open`, {
    userAgentCategory: navigator.userAgent,
  });
}
