import { customAlphabet } from "nanoid";
import crypto from "crypto";

// Unambiguous alphabet (no 0/O/1/I/l) for share tokens that get typed into URLs.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const generateToken = customAlphabet(alphabet, 8);

export function createPublicToken(): string {
  return generateToken();
}

/** Privacy-safe, non-reversible identifier for a visitor, scoped to one share. */
export function hashVisitor(shareId: string, ip: string, userAgent: string): string {
  return crypto
    .createHash("sha256")
    .update(`${shareId}:${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

export function classifyDevice(userAgent: string): "android" | "ios" | "desktop" | "other" {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) return "desktop";
  return "other";
}
