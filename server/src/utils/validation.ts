import { z } from "zod";

export const searchSchema = z.object({
  query: z.string().trim().min(1, "Query is required").max(200),
});

export const createShareSchema = z.object({
  placeName: z.string().trim().min(1).max(200),
  formattedAddress: z.string().trim().min(1).max(400),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  providerPlaceId: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
  durationMinutes: z.number().int().positive().max(60 * 24 * 7).optional(),
  expiresAt: z.string().datetime().optional(),
}).refine((data) => data.durationMinutes || data.expiresAt, {
  message: "Either durationMinutes or expiresAt is required",
});

export const shareListQuerySchema = z.object({
  status: z.enum(["all", "active", "expired", "revoked"]).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["newest", "oldest", "most_opened"]).optional(),
});

export const activityQuerySchema = z.object({
  type: z.enum(["all", "shares", "opens", "expired", "revoked"]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const openShareSchema = z.object({
  userAgentCategory: z.string().trim().max(100).optional(),
});
