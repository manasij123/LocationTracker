import { useEffect, useRef } from "react";
import L from "leaflet";

interface MapViewProps {
  latitude: number;
  longitude: number;
  placeName?: string;
  height?: number | string;
  zoom?: number;
  interactive?: boolean;
  className?: string;
}

const pulseIcon = L.divIcon({
  className: "",
  html: `<div class="pulse-marker"><div class="ring"></div><div class="dot"></div></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function MapView({
  latitude,
  longitude,
  placeName,
  height = 320,
  zoom = 15,
  interactive = true,
  className = "",
}: MapViewProps) {
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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const circle = L.circle([latitude, longitude], {
      radius: 90,
      color: "#2563eb",
      weight: 1,
      fillColor: "#2563eb",
      fillOpacity: 0.12,
    }).addTo(map);

    const marker = L.marker([latitude, longitude], { icon: pulseIcon }).addTo(map);
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
    circleRef.current.setLatLng(latlng);
    if (placeName) markerRef.current.bindPopup(placeName);
    mapRef.current.setView(latlng, zoom, { animate: true });
    // Resize is needed when the container becomes visible after being hidden (e.g. tab switch).
    setTimeout(() => mapRef.current?.invalidateSize(), 80);
  }, [latitude, longitude, placeName, zoom]);

  return (
    <div
      className={`map-container ${className}`}
      style={{ height }}
    >
      <div ref={containerRef} className="map-surface" />
    </div>
  );
}
