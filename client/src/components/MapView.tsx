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
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    const latlng: L.LatLngExpression = [latitude, longitude];
    markerRef.current.setLatLng(latlng);
    markerRef.current.setIcon(buildMarkerIcon(label));
    circleRef.current.setLatLng(latlng);
    if (placeName) markerRef.current.bindPopup(placeName);
    mapRef.current.setView(latlng, zoom, { animate: true });
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
