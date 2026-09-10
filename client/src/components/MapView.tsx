import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useTheme } from "../hooks/useTheme";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

const MOVE_ANIMATION_MS = 1400;

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

const DOT_SIZE = 22;
const LABEL_ICON_WIDTH = 220;
const LABEL_ICON_HEIGHT = 54;

function buildMarkerIcon(label?: string): L.DivIcon {
  if (!label) {
    return L.divIcon({
      className: "",
      html: `<div class="pulse-marker"><div class="ring"></div><div class="dot"></div></div>`,
      iconSize: [DOT_SIZE, DOT_SIZE],
      iconAnchor: [DOT_SIZE / 2, DOT_SIZE / 2],
    });
  }

  return L.divIcon({
    className: "",
    html: `
      <div class="marker-label-wrap">
        <div class="marker-label">${escapeHtml(label)}</div>
        <div class="pulse-marker"><div class="ring"></div><div class="dot"></div></div>
      </div>
    `,
    iconSize: [LABEL_ICON_WIDTH, LABEL_ICON_HEIGHT],
    iconAnchor: [LABEL_ICON_WIDTH / 2, LABEL_ICON_HEIGHT - DOT_SIZE / 2],
  });
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const glideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    });

    L.tileLayer(TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
      detectRetina: true,
    }).addTo(map);

    const circle = L.circle([latitude, longitude], {
      radius: 90,
      color: "#2563eb",
      weight: 1,
      fillColor: "#2563eb",
      fillOpacity: 0.12,
    }).addTo(map);

    const marker = L.marker([latitude, longitude], { icon: buildMarkerIcon(label) }).addTo(map);
    if (placeName) marker.bindPopup(placeName);

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (glideTimeoutRef.current) clearTimeout(glideTimeoutRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    const circle = circleRef.current;

    marker.setIcon(buildMarkerIcon(label));
    if (placeName) marker.bindPopup(placeName);

    const from = lastPositionRef.current;
    const to = { lat: latitude, lng: longitude };
    lastPositionRef.current = to;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (glideTimeoutRef.current) {
      clearTimeout(glideTimeoutRef.current);
      glideTimeoutRef.current = null;
    }

    if (!from || (from.lat === to.lat && from.lng === to.lng)) {
      // First render, or only the zoom/label changed — nothing to glide between.
      marker.setLatLng(to);
      circle.setLatLng(to);
      map.setView(to, zoom, { animate: true });
    } else {
      // Show the move rather than teleporting: zoom out just enough to fit both the old and
      // new spot, let the marker visibly glide across that fixed view from one to the other,
      // then zoom back in on the destination — instead of snapping the pin (or the whole
      // camera) straight to the new point.
      const bounds = L.latLngBounds([
        [from.lat, from.lng],
        [to.lat, to.lng],
      ]);
      map.flyToBounds(bounds, { paddingTopLeft: [40, 70], paddingBottomRight: [40, 40], maxZoom: zoom, duration: 0.6 });

      const tick = (startTime: number) => (now: number) => {
        const t = Math.min(1, (now - startTime) / MOVE_ANIMATION_MS);
        const eased = easeInOutQuad(t);
        const lat = from.lat + (to.lat - from.lat) * eased;
        const lng = from.lng + (to.lng - from.lng) * eased;
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        if (t < 1) {
          animationFrameRef.current = requestAnimationFrame(tick(startTime));
        } else {
          animationFrameRef.current = null;
          // Settled on the destination — zoom back in to the usual close-up level.
          map.flyTo(to, zoom, { duration: 0.6 });
        }
      };

      // Give the zoom-out a moment to settle before the marker starts gliding across it.
      glideTimeoutRef.current = setTimeout(() => {
        animationFrameRef.current = requestAnimationFrame(tick(performance.now()));
      }, 650);
    }

    // Resize is needed when the container becomes visible after being hidden (e.g. tab switch).
    setTimeout(() => mapRef.current?.invalidateSize(), 80);
  }, [latitude, longitude, placeName, label, zoom]);

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
    // The container's size changes instantly, but Leaflet needs a tick to re-measure it.
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  return (
    <div
      className={`map-container ${resolvedTheme === "dark" ? "map-dark" : ""} ${isFullscreen ? "map-fullscreen" : ""} ${className}`}
      style={isFullscreen ? undefined : { height }}
    >
      <div ref={containerRef} className="map-surface" />
      {allowFullscreen && (
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
