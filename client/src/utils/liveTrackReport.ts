import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Share, LiveTrackPoint } from "../types";

// Matches the wait-point radius used while recording (useLiveShare.tsx) — used here only to
// figure out, after the fact, how long a stay around each wait point actually lasted.
const WAIT_RADIUS_METERS = 30;

type RGB = [number, number, number];
const COLOR_LIVE: RGB = [220, 38, 38]; // matches the app's "🔴 LIVE" red
const COLOR_PRIMARY: RGB = [37, 99, 235]; // matches the app's primary blue
const COLOR_AMBER: RGB = [217, 119, 6]; // matches the wait-point pin's amber
const COLOR_AMBER_BG: RGB = [254, 243, 199];
const COLOR_AMBER_TEXT: RGB = [146, 64, 14];
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
  const shareUrl = `${window.location.origin}/share/${share.id}`;

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

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { halign: "center", fontStyle: "bold", fontSize: 11, cellPadding: 4 },
    headStyles: { fillColor: COLOR_PRIMARY, textColor: 255 },
    head: [["Recorded Points", "Wait Points", "Distance Covered"]],
    body: [[String(points.length), String(waitSummaries.length), `${(totalDistance / 1000).toFixed(2)} km`]],
  });
  // @ts-expect-error jspdf-autotable attaches this at runtime; not in its type declarations
  y = doc.lastAutoTable.finalY + 12;

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
