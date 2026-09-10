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

interface MapViewProps {
  latitude: number;
  longitude: number;
  placeName?: string;
  /** Optional caption pinned above the marker, e.g. "ME AT: TCS Gitobitan". */
  label?: string;
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
  const routePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const historyMarkersRef = useRef<google.maps.Marker[]>([]);

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
      routePolylinesRef.current.forEach((p) => p.setMap(null));
      routePolylinesRef.current = [];
      historyMarkersRef.current.forEach((m) => m.setMap(null));
      historyMarkersRef.current = [];
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

    // A real move: pin the spot we're leaving with a numbered marker, so the recipient can
    // see the share's whole journey (1st location, 2nd, 3rd, ...) as updates come in — this
    // and every earlier route segment stay on the map rather than being replaced.
    const sequenceNumber = historyMarkersRef.current.length + 1;
    historyMarkersRef.current.push(
      new google.maps.Marker({
        position: from,
        map,
        label: { text: String(sequenceNumber), color: "#ffffff", fontWeight: "700" },
        title: `Point ${sequenceNumber}: previous location`,
      })
    );

    function glideAlong(path: google.maps.LatLngLiteral[]) {
      // Constant-speed interpolation along a multi-point path, using cumulative
      // great-circle distance so the marker doesn't speed up/slow down between segments.
      const cumulative = [0];
      for (let i = 1; i < path.length; i++) {
        cumulative.push(cumulative[i - 1] + distanceKm(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng));
      }
      const total = cumulative[cumulative.length - 1] || 1;

      function pointAt(fraction: number): google.maps.LatLngLiteral {
        const target = fraction * total;
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

      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / MOVE_ANIMATION_MS);
        const point = pointAt(easeInOutQuad(t));
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
    directionsServiceRef.current.route(
      { origin: from, destination: to, travelMode: google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (cancelled) return;
        if (status === google.maps.DirectionsStatus.OK && result?.routes[0]) {
          const path = result.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
          routePolylinesRef.current.push(
            new google.maps.Polyline({
              path,
              strokeColor: ROUTE_COLOR,
              strokeWeight: 4,
              strokeOpacity: 0.85,
              map,
            })
          );
          glideAlong(path);
        } else {
          // No road route available (or Directions API not reachable) — fall back to the
          // previous straight-line glide so the marker still moves.
          glideStraightLine(from);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, label, zoom, ready]);

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
