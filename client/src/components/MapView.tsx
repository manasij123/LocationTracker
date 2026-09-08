import { useEffect, useRef } from "react";
import L from "leaflet";
import { useTheme } from "../hooks/useTheme";

const LIGHT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

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
}: MapViewProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

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
    if (!mapRef.current) return;
    const map = mapRef.current;
    const isDark = resolvedTheme === "dark";

    const nextLayer = L.tileLayer(isDark ? DARK_TILE_URL : LIGHT_TILE_URL, {
      attribution: isDark ? CARTO_ATTRIBUTION : OSM_ATTRIBUTION,
      maxZoom: 19,
      subdomains: isDark ? "abcd" : "abc",
      detectRetina: true,
    });

    nextLayer.addTo(map);
    nextLayer.bringToBack();

    const previousLayer = tileLayerRef.current;
    tileLayerRef.current = nextLayer;
    if (previousLayer) map.removeLayer(previousLayer);
  }, [resolvedTheme]);

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

  return (
    <div
      className={`map-container ${className}`}
      style={{ height }}
    >
      <div ref={containerRef} className="map-surface" />
    </div>
  );
}
