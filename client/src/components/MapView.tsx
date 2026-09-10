import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { loadGoogleMaps } from "../utils/googleMapsLoader";
import { GOOGLE_MAPS_DARK_STYLE } from "../utils/googleMapDarkStyle";
import { distanceKm } from "../utils/geo";

const ROUTE_COLOR = "#ef4444";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const MOVE_ANIMATION_MS = 1800;
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

function buildMarkerHtml(label?: string): string {
  const pulse = `<div class="pulse-marker" style="position:absolute; left:${-DOT_SIZE / 2}px; top:${-DOT_SIZE / 2}px;"><div class="ring"></div><div class="dot"></div></div>`;
  if (!label) return `<div style="position:relative;">${pulse}</div>`;

  const labelHtml = `<div class="marker-label" style="position:absolute; left:50%; top:-19px; transform: translate(-50%, -100%); white-space:nowrap;">${escapeHtml(label)}</div>`;
  return `<div style="position:relative;">${labelHtml}${pulse}</div>`;
}

const PIN_SIZE = 26;

function buildNumberedPinHtml(n: number, title: string): string {
  return `<div class="numbered-pin" style="position:absolute; left:${-PIN_SIZE / 2}px; top:${-PIN_SIZE / 2}px;" title="${escapeHtml(title)}"><div class="numbered-pin-badge">${n}</div></div>`;
}

function totalRouteDistanceMeters(route: google.maps.DirectionsRoute): number {
  return route.legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
}

interface RouteStep {
  path: google.maps.LatLngLiteral[];
  durationSeconds: number;
}

interface RouteTimeline {
  /** Each leg of the trip (e.g. walk, then train, then walk) with its own realistic duration,
   *  so playback can move at a different pace per leg instead of one constant speed. */
  steps: RouteStep[];
  /** All steps' paths concatenated, for drawing the whole route as one line. */
  path: google.maps.LatLngLiteral[];
  totalDurationSeconds: number;
}

function buildTimelineFromRoute(
  route: google.maps.DirectionsRoute,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral
): RouteTimeline {
  const steps: RouteStep[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const stepPath =
        step.path && step.path.length > 0
          ? step.path.map((p) => ({ lat: p.lat(), lng: p.lng() }))
          : [
              { lat: step.start_location.lat(), lng: step.start_location.lng() },
              { lat: step.end_location.lat(), lng: step.end_location.lng() },
            ];
      steps.push({ path: stepPath, durationSeconds: step.duration?.value ?? 0 });
    }
  }
  // Pin the very first and last points to the exact requested coordinates — Directions snaps
  // to the nearest road/stop, which can otherwise leave a visible gap at either end.
  if (steps.length > 0) {
    steps[0].path[0] = origin;
    const lastStep = steps[steps.length - 1];
    lastStep.path[lastStep.path.length - 1] = destination;
  }
  const totalDurationSeconds = steps.reduce((sum, s) => sum + s.durationSeconds, 0) || 1;
  return { steps, path: steps.flatMap((s) => s.path), totalDurationSeconds };
}

/** Fetches the shortest (by distance) driving route as a single-step timeline — used when no
 *  transit coverage exists for a pair of points. Resolves to null if no route is available. */
function fetchDrivingTimeline(
  service: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral
): Promise<RouteTimeline | null> {
  return new Promise((resolve) => {
    service.route(
      { origin, destination, travelMode: google.maps.TravelMode.DRIVING, provideRouteAlternatives: true },
      (result, status) => {
        if (status !== google.maps.DirectionsStatus.OK || !result || result.routes.length === 0) {
          resolve(null);
          return;
        }
        const shortest = result.routes.reduce((best, route) =>
          totalRouteDistanceMeters(route) < totalRouteDistanceMeters(best) ? route : best
        );
        resolve(buildTimelineFromRoute(shortest, origin, destination));
      }
    );
  });
}

/** Fetches a realistic, real-world-paced route between two points: walking + public transit
 *  (bus/train/metro) legs when available — exactly what Google Maps shows for "how long would
 *  this actually take" — falling back to the shortest driving route when there's no transit
 *  coverage for this pair (e.g. a short local hop, or a region with sparse transit data).
 *  Resolves to null (never rejects) only if neither mode returns anything usable. */
function fetchRouteTimeline(
  service: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral
): Promise<RouteTimeline | null> {
  return new Promise((resolve) => {
    service.route({ origin, destination, travelMode: google.maps.TravelMode.TRANSIT }, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result && result.routes[0]) {
        resolve(buildTimelineFromRoute(result.routes[0], origin, destination));
        return;
      }
      fetchDrivingTimeline(service, origin, destination).then(resolve);
    });
  });
}

/** Maps how long a trip realistically takes to how long its on-screen animation should play —
 *  compressed so a 30-minute cross-town trip doesn't mean a literal 30-minute wait, but still
 *  scaled so longer real trips visibly take longer to watch than shorter ones (diminishing
 *  returns via sqrt, so the gap between "1 min" and "5 min" reads clearly, while "10 min" and
 *  "30 min" don't force an impractically long animation). */
function playbackDurationMs(totalDurationSeconds: number): number {
  const scaled = 2000 + Math.sqrt(totalDurationSeconds) * 300;
  return Math.min(18000, Math.max(2200, scaled));
}

/** A point a given fraction of the way along a path, by cumulative great-circle distance
 *  (so speed is constant across a path's own points, which approximates real motion well
 *  within a single step of a trip). */
function pointAlongPath(path: google.maps.LatLngLiteral[], fraction: number): google.maps.LatLngLiteral {
  if (path.length === 1) return path[0];
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceKm(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng));
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const target = Math.min(1, Math.max(0, fraction)) * total;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < target) i++;
  const segFrom = path[i - 1];
  const segTo = path[i];
  const segLen = cumulative[i] - cumulative[i - 1];
  const segFraction = segLen > 0 ? (target - cumulative[i - 1]) / segLen : 0;
  return {
    lat: segFrom.lat + (segTo.lat - segFrom.lat) * segFraction,
    lng: segFrom.lng + (segTo.lng - segFrom.lng) * segFraction,
  };
}

/** The marker's position at a given point in *real* elapsed trip time — finds which step that
 *  moment falls in (e.g. still walking, or now on the train) and interpolates within it. This
 *  is what makes playback speed vary realistically: a step covering a lot of ground in a short
 *  real duration (a train ride) visibly moves faster than one covering little ground over a
 *  long duration (a walk), because both are being played back at the same time-compression. */
function pointAtElapsedSeconds(steps: RouteStep[], elapsedSeconds: number): google.maps.LatLngLiteral {
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (elapsedSeconds <= acc + step.durationSeconds || i === steps.length - 1) {
      const localFraction = step.durationSeconds > 0 ? (elapsedSeconds - acc) / step.durationSeconds : 1;
      return pointAlongPath(step.path, localFraction);
    }
    acc += step.durationSeconds;
  }
  const lastPath = steps[steps.length - 1].path;
  return lastPath[lastPath.length - 1];
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

interface HtmlOverlayInstance {
  setMap(map: google.maps.Map | null): void;
  setPosition(position: google.maps.LatLngLiteral): void;
  setHtml(html: string): void;
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
    }
    HtmlOverlayClass = HtmlOverlay;
  }
  return HtmlOverlayClass;
}

interface HistoryPoint {
  latitude: number;
  longitude: number;
  placeName: string;
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

        const map = new google.maps.Map(containerRef.current, {
          center: { lat: latitude, lng: longitude },
          zoom,
          disableDefaultUI: !interactive,
          zoomControl: interactive,
          gestureHandling: interactive ? "greedy" : "none",
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        });

        const circle = new google.maps.Circle({
          center: { lat: latitude, lng: longitude },
          radius: 90,
          strokeColor: "#2563eb",
          strokeWeight: 1,
          fillColor: "#2563eb",
          fillOpacity: 0.12,
          map,
        });

        const Overlay = getHtmlOverlayClass();
        const overlay = new Overlay({ lat: latitude, lng: longitude }, buildMarkerHtml(label));
        overlay.setMap(map);

        mapRef.current = map;
        circleRef.current = circle;
        overlayRef.current = overlay;
        lastPositionRef.current = { lat: latitude, lng: longitude };
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

    overlay.setHtml(buildMarkerHtml(label));

    const from = lastPositionRef.current;
    const to = { lat: latitude, lng: longitude };
    lastPositionRef.current = to;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (!from || (from.lat === to.lat && from.lng === to.lng)) {
      overlay.setPosition(to);
      circle.setCenter(to);
      map.setCenter(to);
      map.setZoom(zoom);
      return;
    }

    // Glides at a pace that reflects how long the trip would realistically take (walking,
    // then a train, then walking again — whatever the route actually involves), not a fixed
    // duration regardless of distance or mode.
    function glideAlongTimeline(steps: RouteStep[], totalDurationSeconds: number) {
      const playbackMs = playbackDurationMs(totalDurationSeconds);
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / playbackMs);
        const elapsedSeconds = easeInOutQuad(t) * totalDurationSeconds;
        const point = pointAtElapsedSeconds(steps, elapsedSeconds);
        overlay.setPosition(point);
        circle.setCenter(point);
        map.setCenter(point);
        if (t < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          animationFrameRef.current = null;
        }
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    function glideStraightLine(origin: google.maps.LatLngLiteral) {
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / MOVE_ANIMATION_MS);
        const eased = easeInOutQuad(t);
        const point = {
          lat: origin.lat + (to.lat - origin.lat) * eased,
          lng: origin.lng + (to.lng - origin.lng) * eased,
        };
        overlay.setPosition(point);
        circle.setCenter(point);
        map.setCenter(point);
        if (t < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          animationFrameRef.current = null;
        }
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new google.maps.DirectionsService();
    }

    let cancelled = false;
    fetchRouteTimeline(directionsServiceRef.current, from, to).then((timeline) => {
      if (cancelled) return;
      // The route line itself (with its flowing-arrow animation) is drawn by the history
      // effect below, which owns every segment including this latest one — this effect only
      // needs the timeline to animate the marker along at a realistic pace.
      if (timeline) {
        glideAlongTimeline(timeline.steps, timeline.totalDurationSeconds);
      } else {
        // No route available at all (Directions API unreachable) — fall back to a fixed-time
        // straight-line glide so the marker still moves.
        glideStraightLine(from);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, label, zoom, ready]);

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

    // Only the most recent segment (the last history point to wherever the share is now, or
    // the only segment if there's just one past point) gets the flowing-arrow animation, and
    // only briefly — every older segment is a plain, static line.
    const lastSegmentIndex = chain.length - 1;

    let cancelled = false;
    for (let i = 1; i < chain.length; i++) {
      const origin = chain[i - 1];
      const destination = chain[i];
      const isLastSegment = i === lastSegmentIndex;
      fetchRouteTimeline(service, origin, destination).then((timeline) => {
        if (cancelled) return;
        const polyline = new google.maps.Polyline({
          path: timeline?.path || [origin, destination], // no route available — straight fallback segment
          strokeColor: ROUTE_COLOR,
          strokeWeight: 4,
          strokeOpacity: 0.75,
          icons: isLastSegment ? buildFlowingRouteIcons() : undefined,
          map,
        });
        historyPolylinesRef.current.push(polyline);
        if (isLastSegment) startFlowAnimation(polyline);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [ready, history, latitude, longitude]);

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
          <span style={{ fontSize: 28 }}>🗺️</span>
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
