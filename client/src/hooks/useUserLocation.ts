import { useCallback, useState } from "react";

export type LocationPermissionState = "idle" | "requesting" | "granted" | "denied" | "unsupported";

interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * Reads the browser's real GPS position once, purely to show "how far is this search
 * result from me" in the UI. Never modifies, spoofs, or sends the device's location
 * anywhere — it stays in component state for the current search session only.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<LocationPermissionState>("idle");

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus("granted");
      },
      () => {
        setStatus("denied");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 }
    );
  }, []);

  return { coords, status, request };
}
