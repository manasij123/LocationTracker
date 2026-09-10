import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { loadGoogleMaps } from "../utils/googleMapsLoader";
import { GOOGLE_MAPS_DARK_STYLE } from "../utils/googleMapDarkStyle";

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
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the current theme's map style.
  useEffect(() => {
    mapRef.current?.setOptions({ styles: resolvedTheme === "dark" ? GOOGLE_MAPS_DARK_STYLE : [] });
  }, [resolvedTheme, ready]);

  // Move the marker/circle/camera to a new position — gliding smoothly if this isn't the first render.
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
    } else {
      // One continuous motion: marker, circle and camera all glide together, in lockstep.
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / MOVE_ANIMATION_MS);
        const eased = easeInOutQuad(t);
        const point = {
          lat: from.lat + (to.lat - from.lat) * eased,
          lng: from.lng + (to.lng - from.lng) * eased,
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
