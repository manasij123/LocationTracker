import type { Share } from "../types";

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatStamp(dateInput: string): string {
  return new Date(dateInput).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
}

/**
 * Builds a plain-text, human-readable account of a "My Current Location" live share's
 * recorded trail — meant to be handed to someone (e.g. shown to police) as a record of
 * where the creator actually was and when, not just viewed on a map that only they have
 * access to.
 */
export function buildLiveTrackReport(share: Share): string {
  const points = share.liveTrack;
  const lines: string[] = [];

  lines.push("SpotShare — Live Location Track Report");
  lines.push("=".repeat(40));
  lines.push(`Share link: ${window.location.origin}/share/${share.id}`);
  lines.push(`Sharing started: ${formatStamp(share.createdAt)}`);
  lines.push(
    share.status === "active"
      ? "Sharing status: still active"
      : `Sharing stopped: ${share.revokedAt ? formatStamp(share.revokedAt) : formatStamp(share.expiresAt)} (${share.status})`
  );
  lines.push(`Total recorded points: ${points.length}`);

  const waitPoints = points.filter((p) => p.waitPointLabel != null);
  lines.push(`Wait points detected: ${waitPoints.length}`);

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += distanceMeters(points[i - 1], points[i]);
  }
  lines.push(`Approximate distance covered: ${(totalDistance / 1000).toFixed(2)} km`);
  lines.push("");
  lines.push("Recorded points (oldest first):");
  lines.push("-".repeat(40));

  points.forEach((p, i) => {
    const label = p.waitPointLabel != null ? `  [WAIT POINT W.P:${p.waitPointLabel}]` : "";
    lines.push(`${i + 1}. ${formatStamp(p.recordedAt)} — ${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}${label}`);
  });

  lines.push("");
  lines.push(`Report generated: ${new Date().toLocaleString()}`);

  return lines.join("\n");
}

export function downloadLiveTrackReport(share: Share) {
  const text = buildLiveTrackReport(share);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spotshare-live-track-${share.id}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
