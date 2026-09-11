import type { Share, LiveTrackPoint } from "../types";

// Matches the wait-point radius used while recording (useLiveShare.tsx) — used here only to
// figure out, after the fact, how long a stay around each wait point actually lasted.
const WAIT_RADIUS_METERS = 30;

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

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface WaitPointSummary {
  label: number;
  latitude: number;
  longitude: number;
  arrivedAt: string;
  lastSeenAt: string;
}

/**
 * A wait point is only recorded once, at the moment 5 minutes near one spot has elapsed — but
 * by then, the regular/heartbeat points logged in the minutes leading up to (and following)
 * that moment already trace out the whole stay. Walking outward from each wait point through
 * the contiguous run of nearby points recovers the real arrival/last-seen window, so the report
 * can say "waited here from X to Y (Zm)" instead of just the single trigger timestamp.
 */
function computeWaitPointSummaries(points: LiveTrackPoint[]): WaitPointSummary[] {
  return points.flatMap((p, i) => {
    if (p.waitPointLabel == null) return [];

    let start = i;
    while (start > 0 && distanceMeters(points[start - 1], p) <= WAIT_RADIUS_METERS) start--;
    let end = i;
    while (end < points.length - 1 && distanceMeters(points[end + 1], p) <= WAIT_RADIUS_METERS) end++;

    return [
      {
        label: p.waitPointLabel,
        latitude: p.latitude,
        longitude: p.longitude,
        arrivedAt: points[start].recordedAt,
        lastSeenAt: points[end].recordedAt,
      },
    ];
  });
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

  const waitPointSummaries = computeWaitPointSummaries(points);
  if (waitPointSummaries.length > 0) {
    lines.push("");
    lines.push("Wait points (stayed in one place for 5+ minutes):");
    lines.push("-".repeat(40));
    waitPointSummaries.forEach((w) => {
      const durationMs = new Date(w.lastSeenAt).getTime() - new Date(w.arrivedAt).getTime();
      lines.push(
        `Waited Point W.P:${w.label} — from ${formatStamp(w.arrivedAt)} to ${formatStamp(w.lastSeenAt)} ` +
          `(${formatDuration(durationMs)}) at ${w.latitude.toFixed(6)}, ${w.longitude.toFixed(6)}`
      );
    });
  }

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
