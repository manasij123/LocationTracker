import { useEffect, useRef, useState } from "react";
import { MapIcon } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { loadGoogleMaps } from "../utils/googleMapsLoader";
import { GOOGLE_MAPS_DARK_STYLE } from "../utils/googleMapDarkStyle";
import {
  type RouteStep,
  fetchRouteTimelineForSegment,
  applyDurationOverride,
  playbackDurationMs,
  coveredPathUpTo,
} from "../utils/routeTimeline";

const ROUTE_COLOR = "#ef4444";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const MOVE_ANIMATION_MS = 1800;
const LIVE_PING_GLIDE_MS = 1200;
// A live-tracking trail normally logs a point at least every 90s (the heartbeat interval in
// useLiveShare.tsx) even while stationary — so a gap this much bigger than that almost
// certainly means the tab was backgrounded/suspended (not just normal jitter), and the straight
// line between those two points is not a real, tracked path. Drawn as a dashed, muted segment
// instead of a solid red one so it never reads as an actually-recorded route.
const GAP_THRESHOLD_MS = 3 * 60_000;
const GAP_COLOR = "#9ca3af";
const DOT_SIZE = 22;

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The exact glow shape from the design file: a blurred, gradient-filled crescent that curves in
// behind the dot rather than converging to a point at its center. Traced in a 2180x2497 canvas
// with the anchor circle centered at (1793.5, 1117) — HEADING_CONE_ANCHOR below is that circle's
// position as a fraction of the canvas, used to align it with the real dot (whichever size it
// renders at) and as the pivot point so rotating it by a compass heading sweeps it around the
// dot instead of swinging the whole shape away from it.
const HEADING_CONE_VIEWBOX_WIDTH = 2180;
const HEADING_CONE_VIEWBOX_HEIGHT = 2497;
const HEADING_CONE_ANCHOR_X = 1793.5 / HEADING_CONE_VIEWBOX_WIDTH;
const HEADING_CONE_ANCHOR_Y = 1117 / HEADING_CONE_VIEWBOX_HEIGHT;
const HEADING_CONE_WIDTH = 90;
const HEADING_CONE_HEIGHT = Math.round(HEADING_CONE_WIDTH * (HEADING_CONE_VIEWBOX_HEIGHT / HEADING_CONE_VIEWBOX_WIDTH));
// The traced shape's own "resting" orientation (0deg rotation, as drawn) points left, not up —
// so a heading of 0 (north) needs this added on top of the compass rotation to actually point
// up, matching every other 0deg-is-up convention in this file (updateHeading uses the same
// offset for the same reason).
const HEADING_CONE_ROTATION_OFFSET_DEG = 90;
let headingConeIdCounter = 0;

function buildHeadingConeSvg(): string {
  const uid = headingConeIdCounter++;
  const translate = `translate(${-HEADING_CONE_ANCHOR_X * 100}%, ${-HEADING_CONE_ANCHOR_Y * 100}%)`;
  return `<svg class="heading-cone" width="${HEADING_CONE_WIDTH}" height="${HEADING_CONE_HEIGHT}" viewBox="0 0 ${HEADING_CONE_VIEWBOX_WIDTH} ${HEADING_CONE_VIEWBOX_HEIGHT}" style="position:absolute; left:${DOT_SIZE / 2}px; top:${DOT_SIZE / 2}px; overflow:visible; pointer-events:none; display:none; transform-origin:${HEADING_CONE_ANCHOR_X * 100}% ${HEADING_CONE_ANCHOR_Y * 100}%; transform:${translate} rotate(${HEADING_CONE_ROTATION_OFFSET_DEG}deg);" data-translate="${translate}">
    <defs>
      <filter id="headingConeBlur${uid}" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="50" />
      </filter>
      <linearGradient id="headingConeGradient${uid}" x1="1793.5" y1="1143" x2="100.5" y2="1143" gradientUnits="userSpaceOnUse">
        <stop stop-color="#2563eb" stop-opacity="0.78" />
        <stop offset="1" stop-color="#2563eb" stop-opacity="0.01" />
      </linearGradient>
    </defs>
    <path d="M100 100L1920.5 761.5C1522.5 971.06 1509.5 1260.23 1920.5 1473L100 2396.5V100Z" fill="url(#headingConeGradient${uid})" fill-opacity="0.47" filter="url(#headingConeBlur${uid})" />
  </svg>`;
}

function buildMarkerHtml(label?: string, withHeadingCone?: boolean): string {
  const cone = withHeadingCone ? buildHeadingConeSvg() : "";
  const pulse = `<div class="pulse-marker" style="position:absolute; left:${-DOT_SIZE / 2}px; top:${-DOT_SIZE / 2}px;">${cone}<div class="ring"></div><div class="dot"></div></div>`;
  if (!label) return `<div style="position:relative;">${pulse}</div>`;

  const labelHtml = `<div class="marker-label" style="position:absolute; left:50%; top:-19px; transform: translate(-50%, -100%); white-space:nowrap;">${escapeHtml(label)}</div>`;
  return `<div style="position:relative;">${labelHtml}${pulse}</div>`;
}

const PIN_SIZE = 26;

function buildNumberedPinHtml(n: number, title: string): string {
  return `<div class="numbered-pin" style="position:absolute; left:${-PIN_SIZE / 2}px; top:${-PIN_SIZE / 2}px;" title="${escapeHtml(title)}"><div class="numbered-pin-badge">${n}</div></div>`;
}

function buildWaitPointPinHtml(n: number): string {
  return `<div class="numbered-pin wp-pin" style="position:absolute; left:-32px; top:${-PIN_SIZE / 2}px;" title="Wait Point ${n}"><div class="numbered-pin-badge wp-pin-badge">W.P:${n}</div></div>`;
}

/** A small arrow symbol repeated along a polyline, animated by sliding its offset — gives the
 *  route trail a "flowing" sense of motion/direction instead of sitting static on the map. */
function buildFlowingRouteIcons(): google.maps.IconSequence[] {
  return [
    {
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 2,
        strokeColor: "#ffffff",
        strokeWeight: 1,
        strokeOpacity: 0.85,
        fillColor: ROUTE_COLOR,
        fillOpacity: 0.9,
      },
      offset: "0%",
      repeat: "110px",
    },
  ];
}

/** Splits a live-tracking trail into contiguous "tracked" runs, breaking wherever consecutive
 *  points are further apart in time than GAP_THRESHOLD_MS — each break is reported separately
 *  as its own two-point "gap" bridge, so the caller can style it differently from a real,
 *  continuously-recorded segment. */
function splitLiveTrackIntoSegments(
  points: LiveTrackPoint[]
): { path: google.maps.LatLngLiteral[]; isGap: boolean }[] {
  if (points.length === 0) return [];
  const segments: { path: google.maps.LatLngLiteral[]; isGap: boolean }[] = [];
  let current: google.maps.LatLngLiteral[] = [{ lat: points[0].latitude, lng: points[0].longitude }];

  for (let i = 1; i < points.length; i++) {
    const gapMs = new Date(points[i].recordedAt).getTime() - new Date(points[i - 1].recordedAt).getTime();
    const point = { lat: points[i].latitude, lng: points[i].longitude };
    if (gapMs > GAP_THRESHOLD_MS) {
      segments.push({ path: current, isGap: false });
      segments.push({ path: [current[current.length - 1], point], isGap: true });
      current = [point];
    } else {
      current.push(point);
    }
  }
  segments.push({ path: current, isGap: false });
  return segments;
}

interface HtmlOverlayInstance {
  setMap(map: google.maps.Map | null): void;
  setPosition(position: google.maps.LatLngLiteral): void;
  setHtml(html: string): void;
  updateHeading(heading: number | null): void;
}

// `google.maps.OverlayView` doesn't exist until the SDK script has finished loading, so this
// class can only be defined (its `extends` clause evaluated) lazily, after that — never at
// module scope, or importing this file at all would throw "google is not defined" and take
// down the whole page before the map ever gets a chance to load.
let HtmlOverlayClass: (new (position: google.maps.LatLngLiteral, html: string) => HtmlOverlayInstance) | null = null;

function getHtmlOverlayClass() {
  if (!HtmlOverlayClass) {
    class HtmlOverlay extends google.maps.OverlayView implements HtmlOverlayInstance {
      private div: HTMLDivElement | null = null;
      private position: google.maps.LatLngLiteral;
      private html: string;

      constructor(position: google.maps.LatLngLiteral, html: string) {
        super();
        this.position = position;
        this.html = html;
      }

      onAdd() {
        this.div = document.createElement("div");
        this.div.style.position = "absolute";
        this.div.innerHTML = this.html;
        this.getPanes()!.overlayMouseTarget.appendChild(this.div);
      }

      draw() {
        if (!this.div) return;
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position));
        if (point) {
          this.div.style.left = `${point.x}px`;
          this.div.style.top = `${point.y}px`;
        }
      }

      onRemove() {
        this.div?.parentNode?.removeChild(this.div);
        this.div = null;
      }

      setPosition(position: google.maps.LatLngLiteral) {
        this.position = position;
        this.draw();
      }

      setHtml(html: string) {
        this.html = html;
        if (this.div) this.div.innerHTML = html;
      }

      // Rotates the heading-cone element in place, without touching the rest of the marker's
      // innerHTML — a full setHtml() on every compass tick would also restart the dot's pulse
      // animation and thrash the DOM many times a second.
      updateHeading(heading: number | null) {
        const cone = this.div?.querySelector<SVGElement & HTMLElement>(".heading-cone");
        if (!cone) return;
        if (heading == null) {
          cone.style.display = "none";
        } else {
          cone.style.display = "block";
          const translate = cone.dataset.translate || "";
          cone.style.transform = `${translate} rotate(${heading + HEADING_CONE_ROTATION_OFFSET_DEG}deg)`;
        }
      }
    }
    HtmlOverlayClass = HtmlOverlay;
  }
  return HtmlOverlayClass;
}

interface HistoryPoint {
  latitude: number;
  longitude: number;
  placeName: string;
  travelDurationSeconds?: number | null;
  travelMode?: string | null;
  /** When this point stopped being current (i.e. when the move away from it started) — used
   *  on mount to detect "the page loaded mid-transition" and resume the glide realistically
   *  instead of snapping straight to the destination. */
  updatedAt?: string;
}

interface LiveTrackPoint {
  latitude: number;
  longitude: number;
  waitPointLabel?: number | null;
  recordedAt: string;
}

interface MapViewProps {
  latitude: number;
  longitude: number;
  placeName?: string;
  /** Optional caption pinned above the marker, e.g. "ME AT: TCS Gitobitan". */
  label?: string;
  /** Past points this share pointed at before being updated, oldest first — rendered as
   *  numbered pins (1, 2, 3, ...) with muted connector lines, so the whole journey stays
   *  visible on every page load, not just during a live transition. */
  history?: HistoryPoint[];
  /** Raw GPS fixes for a "My Current Location" live-tracking share, oldest first. Drawn
   *  directly as a growing red trail with no Directions API route-fetching — these are the
   *  actual points walked/driven, not a route estimate — plus numbered "W.P:N" pins wherever
   *  the creator stayed in one place for a while. */
  liveTrack?: LiveTrackPoint[];
  /** True for a "My Current Location" live-tracking share — the marker position updates from
   *  frequent raw GPS pings rather than manual location picks, so each move is a quick, simple
   *  point-to-point glide (no Directions API route-fetching/animation, which would be wasteful
   *  and slow for such short, frequent segments — the actual path is already drawn by
   *  `liveTrack` from the real GPS points). */
  isLiveTracking?: boolean;
  /** Live compass heading in degrees (0 = north, clockwise) for a "my current location" marker
   *  — rotates a Google-Maps-style beam under the dot to show which way the device is pointing.
   *  Omit entirely for markers that aren't "this device's own position" (a place pick, a
   *  recipient viewing someone else's shared location, etc.) — passing null still shows the dot
   *  but hides the beam until a first reading arrives. */
  heading?: number | null;
  /** Creator-supplied travel time (seconds) for the current/live transition — i.e. the move
   *  that just brought the share to (latitude, longitude) — overriding the auto-estimated
   *  Google Maps duration for that specific glide. */
  overrideDurationSeconds?: number | null;
  /** Creator-chosen travel mode for the current/live transition — picks which route/path to
   *  fetch and animate along instead of auto-detecting (transit, else driving). */
  overrideTravelMode?: string | null;
  height?: number | string;
  zoom?: number;
  interactive?: boolean;
  className?: string;
  /** Shows a button that expands the map to fill the whole screen, like Google Maps. */
  allowFullscreen?: boolean;
}

export default function MapView({
  latitude,
  longitude,
  placeName,
  label,
  history = [],
  liveTrack = [],
  isLiveTracking = false,
  heading,
  overrideDurationSeconds = null,
  overrideTravelMode = null,
  height = 320,
  zoom = 15,
  interactive = true,
  className = "",
  allowFullscreen = false,
}: MapViewProps) {
  const { resolvedTheme } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<HtmlOverlayInstance | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const historyMarkersRef = useRef<HtmlOverlayInstance[]>([]);
  const historyPolylinesRef = useRef<google.maps.Polyline[]>([]);
  const lastHistoryKeyRef = useRef<string | null>(null);
  const flowOffsetRef = useRef(0);
  const flowAnimationFrameRef = useRef<number | null>(null);
  const activeFlowPolylineRef = useRef<google.maps.Polyline | null>(null);
  const flowStopAtRef = useRef(0);
  const liveSegmentPolylineRef = useRef<google.maps.Polyline | null>(null);
  const liveSegmentActiveRef = useRef(false);
  const userInteractingRef = useRef(false);
  const pendingResumeElapsedMsRef = useRef<number | null>(null);
  const liveTrackSegmentPolylinesRef = useRef<google.maps.Polyline[]>([]);
  const liveWaitPointMarkersRef = useRef<HtmlOverlayInstance[]>([]);
  const headingRef = useRef(heading);
  headingRef.current = heading;

  // Load the SDK and create the map once.
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setLoadError(true);
      return;
    }
    let cancelled = false;

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        // If the page just loaded (or reloaded) mid-transition — the most recent update's real
        // travel time hasn't elapsed yet — start the marker at that transition's origin instead
        // of snapping straight to the destination, so the move effect below can resume the
        // glide from wherever it should realistically be by now, not restart or skip it.
        let initialPosition = { lat: latitude, lng: longitude };
        const lastHistoryEntry = history[history.length - 1];
        if (lastHistoryEntry?.updatedAt) {
          const elapsedMs = Date.now() - new Date(lastHistoryEntry.updatedAt).getTime();
          if (elapsedMs >= 0) {
            initialPosition = { lat: lastHistoryEntry.latitude, lng: lastHistoryEntry.longitude };
            pendingResumeElapsedMsRef.current = elapsedMs;
          }
        }

        const map = new google.maps.Map(containerRef.current, {
          center: initialPosition,
          zoom,
          disableDefaultUI: !interactive,
          zoomControl: interactive,
          gestureHandling: interactive ? "greedy" : "none",
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        });

        // While the camera is auto-following the marker during a glide, don't fight a user who
        // is actively panning/zooming the map themselves — 'dragstart' only fires for a real
        // drag gesture, and since nothing in this component calls setZoom except the initial
        // snap (reset away before any glide begins), 'zoom_changed' here only means the user
        // pinched or scrolled to zoom.
        map.addListener("dragstart", () => {
          userInteractingRef.current = true;
        });
        map.addListener("zoom_changed", () => {
          userInteractingRef.current = true;
        });

        const circle = new google.maps.Circle({
          center: initialPosition,
          radius: 90,
          strokeColor: "#2563eb",
          strokeWeight: 1,
          fillColor: "#2563eb",
          fillOpacity: 0.12,
          map,
        });

        const Overlay = getHtmlOverlayClass();
        const overlay = new Overlay(initialPosition, buildMarkerHtml(label, headingRef.current !== undefined));
        overlay.setMap(map);
        overlay.updateHeading(headingRef.current ?? null);

        mapRef.current = map;
        circleRef.current = circle;
        overlayRef.current = overlay;
        lastPositionRef.current = initialPosition;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      overlayRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      historyMarkersRef.current.forEach((m) => m.setMap(null));
      historyMarkersRef.current = [];
      historyPolylinesRef.current.forEach((p) => p.setMap(null));
      historyPolylinesRef.current = [];
      liveSegmentPolylineRef.current?.setMap(null);
      liveSegmentPolylineRef.current = null;
      liveTrackSegmentPolylinesRef.current.forEach((p) => p.setMap(null));
      liveTrackSegmentPolylinesRef.current = [];
      liveWaitPointMarkersRef.current.forEach((m) => m.setMap(null));
      liveWaitPointMarkersRef.current = [];
      if (flowAnimationFrameRef.current) cancelAnimationFrame(flowAnimationFrameRef.current);
      activeFlowPolylineRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the current theme's map style.
  useEffect(() => {
    mapRef.current?.setOptions({ styles: resolvedTheme === "dark" ? GOOGLE_MAPS_DARK_STYLE : [] });
  }, [resolvedTheme, ready]);

  // Move the marker/circle/camera to a new position — gliding smoothly along the actual road
  // route (not a straight line) if this isn't the first render.
  useEffect(() => {
    if (!ready || !mapRef.current || !overlayRef.current || !circleRef.current) return;
    const map = mapRef.current;
    const overlay = overlayRef.current;
    const circle = circleRef.current;

    overlay.setHtml(buildMarkerHtml(label, headingRef.current !== undefined));
    overlay.updateHeading(headingRef.current ?? null);

    const from = lastPositionRef.current;
    const to = { lat: latitude, lng: longitude };
    lastPositionRef.current = to;

    // Only meaningful on the very first run after mount — consumed once so later, genuinely
    // live updates never mistakenly think they're "resuming" something.
    const resumeElapsedMs = pendingResumeElapsedMsRef.current;
    pendingResumeElapsedMsRef.current = null;

    // Reset per transition: give the camera a fresh chance to auto-follow this specific move,
    // regardless of whether the user panned/zoomed during an earlier one.
    userInteractingRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear whatever live-trail line the previous transition left behind — by the time a new
    // one starts, the history effect below has already redrawn that older segment as a normal
    // static line, so this would otherwise just sit on top of it as a stale duplicate.
    liveSegmentPolylineRef.current?.setMap(null);
    liveSegmentPolylineRef.current = null;

    // Live-tracking shares move from frequent raw GPS pings, not manual location picks — the
    // real path is already drawn by the `liveTrack` effect from the actual points, so here we
    // just glide the dot itself, quickly and directly, with no Directions API call per ping.
    if (isLiveTracking) {
      liveSegmentActiveRef.current = false;
      if (!from) {
        overlay.setPosition(to);
        circle.setCenter(to);
        map.setCenter(to);
      } else if (from.lat !== to.lat || from.lng !== to.lng) {
        const startTime = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - startTime) / LIVE_PING_GLIDE_MS);
          const point = { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
          overlay.setPosition(point);
          circle.setCenter(point);
          if (!userInteractingRef.current) map.setCenter(point);
          if (t < 1) {
            animationFrameRef.current = requestAnimationFrame(tick);
          } else {
            animationFrameRef.current = null;
          }
        };
        animationFrameRef.current = requestAnimationFrame(tick);
      }
      return;
    }

    if (!from || (from.lat === to.lat && from.lng === to.lng)) {
      liveSegmentActiveRef.current = false;
      overlay.setPosition(to);
      circle.setCenter(to);
      map.setCenter(to);
      map.setZoom(zoom);
      return;
    }

    liveSegmentActiveRef.current = true;

    // Glides at the real, estimated pace of the trip (walking, then a train, then walking
    // again — whatever the route actually involves) — linear against elapsed real time, no
    // easing, so it arrives exactly on the real duration mark rather than an approximation.
    // The route line is drawn here too, growing behind the marker as it moves rather than
    // appearing all at once before anything has actually moved. `resumeSeconds` lets a page
    // load/reload mid-transition pick up from wherever the trip should realistically be by
    // now, instead of restarting it from the origin or skipping straight to the destination.
    function glideAlongTimeline(steps: RouteStep[], totalDurationSeconds: number, resumeSeconds: number) {
      const initialCovered = coveredPathUpTo(steps, resumeSeconds);
      const liveLine = new google.maps.Polyline({
        path: initialCovered,
        strokeColor: ROUTE_COLOR,
        strokeWeight: 4,
        strokeOpacity: 0.85,
        icons: buildFlowingRouteIcons(),
        map,
      });
      liveSegmentPolylineRef.current = liveLine;
      startFlowAnimation(liveLine);

      const remainingSeconds = totalDurationSeconds - resumeSeconds;
      const playbackMs = playbackDurationMs(remainingSeconds);
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / playbackMs);
        const elapsedSeconds = resumeSeconds + t * remainingSeconds;
        const covered = coveredPathUpTo(steps, elapsedSeconds);
        const point = covered[covered.length - 1];
        overlay.setPosition(point);
        circle.setCenter(point);
        // Keep following the marker only while the user isn't actively panning/zooming
        // themselves — recentering every frame regardless made the map feel stuck/unresponsive
        // to touch and scroll gestures during a glide.
        if (!userInteractingRef.current) map.setCenter(point);
        liveLine.setPath(covered);
        if (t < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          animationFrameRef.current = null;
          liveSegmentActiveRef.current = false;
        }
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    function glideStraightLine(origin: google.maps.LatLngLiteral, totalMs: number, resumeMs: number) {
      const startFraction = totalMs > 0 ? Math.min(1, resumeMs / totalMs) : 1;
      const remainingMs = Math.max(0, totalMs - resumeMs);
      const pointAtFraction = (f: number) => ({
        lat: origin.lat + (to.lat - origin.lat) * f,
        lng: origin.lng + (to.lng - origin.lng) * f,
      });

      const liveLine = new google.maps.Polyline({
        path: [origin, pointAtFraction(startFraction)],
        strokeColor: ROUTE_COLOR,
        strokeWeight: 4,
        strokeOpacity: 0.85,
        icons: buildFlowingRouteIcons(),
        map,
      });
      liveSegmentPolylineRef.current = liveLine;
      startFlowAnimation(liveLine);

      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / (remainingMs || 1));
        const fraction = startFraction + t * (1 - startFraction);
        const point = pointAtFraction(fraction);
        overlay.setPosition(point);
        circle.setCenter(point);
        // Keep following the marker only while the user isn't actively panning/zooming
        // themselves — recentering every frame regardless made the map feel stuck/unresponsive
        // to touch and scroll gestures during a glide.
        if (!userInteractingRef.current) map.setCenter(point);
        liveLine.setPath([origin, point]);
        if (t < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          animationFrameRef.current = null;
          liveSegmentActiveRef.current = false;
        }
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new google.maps.DirectionsService();
    }

    let cancelled = false;
    fetchRouteTimelineForSegment(directionsServiceRef.current, from, to, overrideTravelMode).then((timeline) => {
      if (cancelled) return;
      if (timeline) {
        const finalTimeline = overrideDurationSeconds ? applyDurationOverride(timeline, overrideDurationSeconds) : timeline;
        const resumeSeconds = resumeElapsedMs != null ? resumeElapsedMs / 1000 : 0;
        if (resumeSeconds >= finalTimeline.totalDurationSeconds) {
          // The real trip would already be over by now — arrive immediately rather than
          // re-animating a transition that's realistically long since finished.
          liveSegmentActiveRef.current = false;
          overlay.setPosition(to);
          circle.setCenter(to);
          map.setCenter(to);
        } else {
          glideAlongTimeline(finalTimeline.steps, finalTimeline.totalDurationSeconds, resumeSeconds);
        }
      } else {
        // No route available at all (Directions API unreachable) — fall back to a straight-
        // line glide, honoring a manual override if one was given, or the old fixed time.
        const totalMs = overrideDurationSeconds ? overrideDurationSeconds * 1000 : MOVE_ANIMATION_MS;
        glideStraightLine(from, totalMs, resumeElapsedMs ?? 0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, label, zoom, ready, overrideDurationSeconds, overrideTravelMode, isLiveTracking]);

  // Kept separate from the move effect above so a compass tick (many times a second) only ever
  // rotates the existing beam element, never retriggers the glide/route-fetching logic there.
  useEffect(() => {
    if (!ready) return;
    overlayRef.current?.updateHeading(heading ?? null);
  }, [heading, ready]);

  // Render the share's past points (server-persisted, so this survives reloads) as numbered
  // pins, each consecutive pair connected by the same bold, road-following route the live
  // glide animation draws — so the whole journey looks the same whether you're watching an
  // update happen live or opening the link fresh after several updates already happened.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    const key = [...history.map((h) => `${h.latitude},${h.longitude}`), `${latitude},${longitude}`].join("|");
    if (key === lastHistoryKeyRef.current) return;
    lastHistoryKeyRef.current = key;

    historyMarkersRef.current.forEach((m) => m.setMap(null));
    const Overlay = getHtmlOverlayClass();
    historyMarkersRef.current = history.map((point, i) => {
      const marker = new Overlay(
        { lat: point.latitude, lng: point.longitude },
        buildNumberedPinHtml(i + 1, `Point ${i + 1}: ${point.placeName}`)
      );
      marker.setMap(map);
      return marker;
    });

    historyPolylinesRef.current.forEach((p) => p.setMap(null));
    historyPolylinesRef.current = [];

    const chain = [...history.map((h) => ({ lat: h.latitude, lng: h.longitude })), { lat: latitude, lng: longitude }];
    if (chain.length < 2) return;

    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new google.maps.DirectionsService();
    }
    const service = directionsServiceRef.current;

    // The most recent segment (the last history point to wherever the share is now) is only
    // drawn here as a plain static line when nothing is actively animating it — while a live
    // transition is in progress, the move effect above owns that segment's line, growing it
    // behind the marker instead of showing the whole thing immediately.
    const lastSegmentIndex = chain.length - 1;

    let cancelled = false;
    for (let i = 1; i < chain.length; i++) {
      if (i === lastSegmentIndex && liveSegmentActiveRef.current) continue;
      const origin = chain[i - 1];
      const destination = chain[i];
      const segmentTravelMode = history[i - 1]?.travelMode;
      fetchRouteTimelineForSegment(service, origin, destination, segmentTravelMode).then((timeline) => {
        if (cancelled) return;
        const polyline = new google.maps.Polyline({
          path: timeline?.path || [origin, destination], // no route available — straight fallback segment
          strokeColor: ROUTE_COLOR,
          strokeWeight: 4,
          strokeOpacity: 0.75,
          map,
        });
        historyPolylinesRef.current.push(polyline);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [ready, history, latitude, longitude]);

  // Draws a "My Current Location" live-tracking share's raw GPS trail as a growing red line —
  // no Directions API route-fetching, since these are the actual points walked/driven, not an
  // estimate — plus a numbered "W.P:N" pin at each point the creator stayed put for a while.
  // Rebuilt from scratch on every change rather than diffed — trail sizes here are modest, and
  // this keeps the gap-splitting logic simple.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    liveTrackSegmentPolylinesRef.current.forEach((p) => p.setMap(null));
    liveTrackSegmentPolylinesRef.current = splitLiveTrackIntoSegments(liveTrack).map((segment) =>
      segment.isGap
        ? new google.maps.Polyline({
            path: segment.path,
            strokeOpacity: 0,
            icons: [
              {
                icon: { path: "M 0,-1 0,1", strokeOpacity: 0.75, strokeColor: GAP_COLOR, scale: 3 },
                offset: "0",
                repeat: "10px",
              },
            ],
            map,
          })
        : new google.maps.Polyline({
            path: segment.path,
            strokeColor: ROUTE_COLOR,
            strokeWeight: 4,
            strokeOpacity: 0.85,
            map,
          })
    );

    liveWaitPointMarkersRef.current.forEach((m) => m.setMap(null));
    const Overlay = getHtmlOverlayClass();
    liveWaitPointMarkersRef.current = liveTrack
      .filter((p) => p.waitPointLabel != null)
      .map((p) => {
        const marker = new Overlay({ lat: p.latitude, lng: p.longitude }, buildWaitPointPinHtml(p.waitPointLabel as number));
        marker.setMap(map);
        return marker;
      });
  }, [ready, liveTrack]);

  // Plays the flowing-arrow animation on a single polyline (the most recent segment) for a
  // few seconds, then stops — a brief highlight of "this is what just moved", not a
  // permanent decoration. Re-arming while already running just extends/retargets it.
  function startFlowAnimation(polyline: google.maps.Polyline) {
    activeFlowPolylineRef.current = polyline;
    flowStopAtRef.current = performance.now() + 2500;
    if (flowAnimationFrameRef.current != null) return;

    function tick() {
      const target = activeFlowPolylineRef.current;
      if (!target || performance.now() > flowStopAtRef.current) {
        flowAnimationFrameRef.current = null;
        return;
      }
      flowOffsetRef.current = (flowOffsetRef.current + 0.25) % 100;
      const icons = target.get("icons");
      if (icons && icons[0]) {
        icons[0].offset = `${flowOffsetRef.current}%`;
        target.set("icons", icons);
      }
      flowAnimationFrameRef.current = requestAnimationFrame(tick);
    }
    flowAnimationFrameRef.current = requestAnimationFrame(tick);
  }

  // Fullscreen toggle: lock body scroll and force Google Maps to re-measure its container.
  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const center = map.getCenter();
    const timer = setTimeout(() => {
      google.maps.event.trigger(map, "resize");
      if (center) map.setCenter(center);
    }, 80);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  return (
    <div
      className={`map-container ${isFullscreen ? "map-fullscreen" : ""} ${className}`}
      style={isFullscreen ? undefined : { height }}
    >
      {loadError && (
        <div className="flex-col gap-8" style={{ height: "100%", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
          <MapIcon size={28} />
          <p className="text-muted" style={{ fontSize: 13 }}>Couldn't load the map.</p>
        </div>
      )}
      {!loadError && <div ref={containerRef} className="map-surface" />}
      {allowFullscreen && !loadError && (
        <button
          className="map-fullscreen-btn"
          onClick={() => setIsFullscreen((v) => !v)}
          aria-label={isFullscreen ? "Exit fullscreen map" : "View map fullscreen"}
        >
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
