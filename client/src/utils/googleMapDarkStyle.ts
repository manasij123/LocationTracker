/** Standard "night mode" style array for Google Maps, used when the app is in dark mode. */
export const GOOGLE_MAPS_DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1d29" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1d29" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8fa3" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d6d8e0" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8a8fa3" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#14251c" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a72" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2f42" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1d29" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8fa3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a4159" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a1d29" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#c0c4d6" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2a2f42" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1420" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5c6b8a" }] },
];
