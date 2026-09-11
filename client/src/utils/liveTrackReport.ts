import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getPublicOrigin } from "./publicOrigin";
import type { Share, LiveTrackPoint } from "../types";

// Matches the wait-point radius used while recording (useLiveShare.tsx) — used here only to
// figure out, after the fact, how long a stay around each wait point actually lasted.
const WAIT_RADIUS_METERS = 30;
// Matches the gap threshold used for map rendering (MapView.tsx) — a live-tracking trail
// normally logs a point at least every 90s (the heartbeat interval), so a gap much bigger than
// that almost certainly means the tab was backgrounded/suspended, not normal jitter.
const GAP_THRESHOLD_MS = 3 * 60_000;

type RGB = [number, number, number];
const COLOR_LIVE: RGB = [220, 38, 38]; // matches the app's "🔴 LIVE" red
const COLOR_PRIMARY: RGB = [37, 99, 235]; // matches the app's primary blue
const COLOR_AMBER: RGB = [217, 119, 6]; // matches the wait-point pin's amber
const COLOR_AMBER_BG: RGB = [254, 243, 199];
const COLOR_AMBER_TEXT: RGB = [146, 64, 14];
const COLOR_GRAY: RGB = [107, 114, 128];
const COLOR_GRAY_BG: RGB = [229, 231, 235];
const COLOR_TEXT: RGB = [17, 24, 39];
const COLOR_MUTED: RGB = [107, 114, 128];

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

/** A universal Google Maps link — opens the native app on a phone if installed, else the web
 *  map in a browser tab — pinned exactly at this point, for anyone reading the report. */
function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** A Google Maps directions link between two points — used for a gap, so a reader can see both
 *  ends of the untracked stretch (and the straight-line distance between them) at a glance. */
function googleMapsDirectionsUrl(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${a.latitude},${a.longitude}&destination=${b.latitude},${b.longitude}`;
}

function timeGapMs(a: { recordedAt: string }, b: { recordedAt: string }): number {
  return new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime();
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
 * can say "waited here from X to Y (Zm)" instead of just the single trigger timestamp. The walk
 * also stops at a recording gap (GAP_THRESHOLD_MS) even if the next point is still close by —
 * tracking wasn't actually running during that stretch, so it shouldn't be counted as part of a
 * continuously-observed stay.
 */
function computeWaitPointSummaries(points: LiveTrackPoint[]): WaitPointSummary[] {
  return points.flatMap((p, i) => {
    if (p.waitPointLabel == null) return [];

    let start = i;
    while (
      start > 0 &&
      distanceMeters(points[start - 1], p) <= WAIT_RADIUS_METERS &&
      timeGapMs(points[start - 1], points[start]) <= GAP_THRESHOLD_MS
    ) {
      start--;
    }
    let end = i;
    while (
      end < points.length - 1 &&
      distanceMeters(points[end + 1], p) <= WAIT_RADIUS_METERS &&
      timeGapMs(points[end], points[end + 1]) <= GAP_THRESHOLD_MS
    ) {
      end++;
    }

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

interface GapSummary {
  beforeIndex: number;
  afterIndex: number;
  gapMs: number;
}

/** Finds every stretch where consecutive points are further apart in time than the normal
 *  heartbeat cadence would ever produce — almost always because the browser tab was
 *  backgrounded (or the device lost GPS/network) for that stretch, so nothing was recorded and
 *  a straight line between the two points would misrepresent an untracked path as a real one. */
function computeGapSummaries(points: LiveTrackPoint[]): GapSummary[] {
  const gaps: GapSummary[] = [];
  for (let i = 1; i < points.length; i++) {
    const gapMs = timeGapMs(points[i - 1], points[i]);
    if (gapMs > GAP_THRESHOLD_MS) {
      gaps.push({ beforeIndex: i - 1, afterIndex: i, gapMs });
    }
  }
  return gaps;
}

/**
 * Builds a formatted, colorized PDF account of a "My Current Location" live share's recorded
 * trail — meant to be handed to someone (e.g. shown to police) as a record of where the
 * creator actually was and when. Every point and wait point links straight to Google Maps at
 * that exact coordinate, so a reader can open it with one tap rather than typing coordinates in
 * by hand.
 */
export function downloadLiveTrackReportPdf(share: Share) {
  const points = share.liveTrack;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(...COLOR_LIVE);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SpotShare — Live Location Track Report", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("A safety record of a real-time shared location", 14, 19);

  doc.setTextColor(...COLOR_TEXT);
  let y = 36;
  const shareUrl = `${getPublicOrigin()}/share/${share.id}`;

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.text("Share link:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLOR_PRIMARY);
  doc.textWithLink(shareUrl, 42, y, { url: shareUrl });
  doc.setTextColor(...COLOR_TEXT);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Sharing started:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(formatStamp(share.createdAt), 55, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Status:", 14, y);
  doc.setFont("helvetica", "normal");
  const statusText =
    share.status === "active"
      ? "Still active"
      : `Stopped ${share.revokedAt ? formatStamp(share.revokedAt) : formatStamp(share.expiresAt)} (${share.status})`;
  doc.text(statusText, 55, y);
  y += 10;

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += distanceMeters(points[i - 1], points[i]);
  }
  const waitSummaries = computeWaitPointSummaries(points);
  const gapSummaries = computeGapSummaries(points);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { halign: "center", fontStyle: "bold", fontSize: 11, cellPadding: 4 },
    headStyles: { fillColor: COLOR_PRIMARY, textColor: 255 },
    head: [["Recorded Points", "Wait Points", "GPS Gaps", "Distance Covered"]],
    body: [[String(points.length), String(waitSummaries.length), String(gapSummaries.length), `${(totalDistance / 1000).toFixed(2)} km`]],
  });
  // @ts-expect-error jspdf-autotable attaches this at runtime; not in its type declarations
  y = doc.lastAutoTable.finalY + 12;

  if (gapSummaries.length > 0) {
    doc.setFontSize(12.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLOR_GRAY);
    doc.text("GPS Gaps (tracking paused — not a recorded path)", 14, y);
    doc.setTextColor(...COLOR_TEXT);
    y += 4;

    autoTable(doc, {
      startY: y,
      theme: "striped",
      headStyles: { fillColor: COLOR_GRAY, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
      head: [["Gap #", "Last Seen", "Resumed", "Duration", "Map"]],
      body: gapSummaries.map((g, i) => [
        `Gap ${i + 1}`,
        formatStamp(points[g.beforeIndex].recordedAt),
        formatStamp(points[g.afterIndex].recordedAt),
        formatDuration(g.gapMs),
        "View Gap on Map",
      ]),
      didParseCell: (data) => {
        if (data.section === "body") {
          data.cell.styles.fillColor = COLOR_GRAY_BG;
          data.cell.styles.textColor = COLOR_TEXT;
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          const g = gapSummaries[data.row.index];
          doc.setTextColor(...COLOR_PRIMARY);
          doc.textWithLink("View Gap on Map", data.cell.x + 2, data.cell.y + data.cell.height / 2 + 1.5, {
            url: googleMapsDirectionsUrl(points[g.beforeIndex], points[g.afterIndex]),
          });
        }
      },
    });
    // @ts-expect-error jspdf-autotable attaches this at runtime; not in its type declarations
    y = doc.lastAutoTable.finalY + 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLOR_MUTED);
    doc.text("No location was recorded during a gap — most likely the browser tab was backgrounded or the device lost GPS/network.", 14, y);
    doc.setTextColor(...COLOR_TEXT);
    y += 10;
  }

  if (waitSummaries.length > 0) {
    doc.setFontSize(12.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLOR_AMBER);
    doc.text("Wait Points (stayed in one place for 5+ minutes)", 14, y);
    doc.setTextColor(...COLOR_TEXT);
    y += 4;

    autoTable(doc, {
      startY: y,
      theme: "striped",
      headStyles: { fillColor: COLOR_AMBER, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
      head: [["W.P", "From", "To", "Duration", "Coordinates", "Map"]],
      body: waitSummaries.map((w) => [
        `W.P:${w.label}`,
        formatStamp(w.arrivedAt),
        formatStamp(w.lastSeenAt),
        formatDuration(new Date(w.lastSeenAt).getTime() - new Date(w.arrivedAt).getTime()),
        `${w.latitude.toFixed(6)}, ${w.longitude.toFixed(6)}`,
        "Open in Maps",
      ]),
      didParseCell: (data) => {
        if (data.section === "body") {
          data.cell.styles.fillColor = COLOR_AMBER_BG;
          data.cell.styles.textColor = COLOR_AMBER_TEXT;
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const w = waitSummaries[data.row.index];
          doc.setTextColor(...COLOR_PRIMARY);
          doc.textWithLink("Open in Maps", data.cell.x + 2, data.cell.y + data.cell.height / 2 + 1.5, {
            url: googleMapsUrl(w.latitude, w.longitude),
          });
        }
      },
    });
    // @ts-expect-error jspdf-autotable attaches this at runtime; not in its type declarations
    y = doc.lastAutoTable.finalY + 12;
  }

  if (y > pageHeight - 30) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(12.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text("Recorded Points (oldest first)", 14, y);
  doc.setTextColor(...COLOR_TEXT);
  y += 4;

  autoTable(doc, {
    startY: y,
    theme: "striped",
    headStyles: { fillColor: COLOR_PRIMARY, textColor: 255 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 10 } },
    head: [["#", "Time", "Latitude", "Longitude", "Type", "Map"]],
    body: points.map((p, i) => [
      String(i + 1),
      formatStamp(p.recordedAt),
      p.latitude.toFixed(6),
      p.longitude.toFixed(6),
      p.waitPointLabel != null ? `Wait Point W.P:${p.waitPointLabel}` : "—",
      "Open in Maps",
    ]),
    didParseCell: (data) => {
      if (data.section === "body" && points[data.row.index].waitPointLabel != null) {
        data.cell.styles.fillColor = COLOR_AMBER_BG;
        data.cell.styles.textColor = COLOR_AMBER_TEXT;
      }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const p = points[data.row.index];
        doc.setTextColor(...COLOR_PRIMARY);
        doc.textWithLink("Open in Maps", data.cell.x + 2, data.cell.y + data.cell.height / 2 + 1.5, {
          url: googleMapsUrl(p.latitude, p.longitude),
        });
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Report generated ${new Date().toLocaleString()} — Page ${i} of ${pageCount}`, 14, pageHeight - 8);
  }

  doc.save(`spotshare-live-track-${share.id}.pdf`);
}
