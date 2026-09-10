import { useEffect, useState } from "react";
import LocationSearch from "./LocationSearch";
import MapView from "./MapView";
import { loadGoogleMaps } from "../utils/googleMapsLoader";
import { updateShareLocation } from "../services/shares";
import { ApiRequestError } from "../services/api";
import type { PlaceResult, Share } from "../types";

type TravelModeKey = "driving" | "walking" | "bicycling" | "transit";

const MODE_OPTIONS: { key: TravelModeKey; label: string; icon: string }[] = [
  { key: "driving", label: "Driving", icon: "🚗" },
  { key: "transit", label: "Transit", icon: "🚆" },
  { key: "walking", label: "Walking", icon: "🚶" },
  { key: "bicycling", label: "Cycling", icon: "🚲" },
];

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

interface UpdateLocationSheetProps {
  open: boolean;
  shareId: string;
  currentPlaceName: string;
  currentLatitude: number;
  currentLongitude: number;
  onClose: () => void;
  onUpdated: (share: Share) => void;
}

export default function UpdateLocationSheet({
  open,
  shareId,
  currentPlaceName,
  currentLatitude,
  currentLongitude,
  onClose,
  onUpdated,
}: UpdateLocationSheetProps) {
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [travelMinutes, setTravelMinutes] = useState("");
  const [modeEstimates, setModeEstimates] = useState<Partial<Record<TravelModeKey, number>>>({});
  const [selectedMode, setSelectedMode] = useState<TravelModeKey | null>(null);
  const [loadingModes, setLoadingModes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up how long each way of getting there would realistically take — like Google Maps'
  // own "Best / Driving / Transit / Walking" picker — so the creator can pick the mode that
  // actually matches how they're getting there instead of always auto-detecting one.
  useEffect(() => {
    if (!place || !GOOGLE_MAPS_API_KEY) {
      setModeEstimates({});
      setSelectedMode(null);
      return;
    }
    let cancelled = false;
    setLoadingModes(true);
    setSelectedMode(null);

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(() => {
        if (cancelled) return;
        const service = new google.maps.DirectionsService();
        const origin = { lat: currentLatitude, lng: currentLongitude };
        const destination = { lat: place.latitude, lng: place.longitude };
        // Only safe to reference google.maps.TravelMode.* here, after the SDK has confirmed
        // loaded — evaluating it any earlier (e.g. a module-scope map) would throw.
        const travelModeEnum: Record<TravelModeKey, google.maps.TravelMode> = {
          driving: google.maps.TravelMode.DRIVING,
          walking: google.maps.TravelMode.WALKING,
          bicycling: google.maps.TravelMode.BICYCLING,
          transit: google.maps.TravelMode.TRANSIT,
        };

        return Promise.all(
          MODE_OPTIONS.map(
            (mode) =>
              new Promise<[TravelModeKey, number | null]>((resolve) => {
                service.route(
                  { origin, destination, travelMode: travelModeEnum[mode.key] },
                  (result, status) => {
                    if (status === google.maps.DirectionsStatus.OK && result?.routes[0]) {
                      const seconds = result.routes[0].legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
                      resolve([mode.key, seconds]);
                    } else {
                      resolve([mode.key, null]);
                    }
                  }
                );
              })
          )
        );
      })
      .then((entries) => {
        if (cancelled || !entries) return;
        const estimates: Partial<Record<TravelModeKey, number>> = {};
        for (const [key, seconds] of entries) {
          if (seconds != null) estimates[key] = seconds;
        }
        setModeEstimates(estimates);
      })
      .finally(() => {
        if (!cancelled) setLoadingModes(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.latitude, place?.longitude, currentLatitude, currentLongitude]);

  if (!open) return null;

  function handleClose() {
    setPlace(null);
    setTravelMinutes("");
    setSelectedMode(null);
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!place) return;
    setSubmitting(true);
    setError(null);
    try {
      const minutes = parseFloat(travelMinutes);
      const manualSeconds = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : undefined;
      const { share } = await updateShareLocation(shareId, {
        placeName: place.name,
        formattedAddress: place.formattedAddress,
        latitude: place.latitude,
        longitude: place.longitude,
        providerPlaceId: place.placeId,
        travelDurationSeconds: manualSeconds ?? (selectedMode ? modeEstimates[selectedMode] : undefined),
        travelMode: selectedMode ?? undefined,
      });
      onUpdated(share);
      setPlace(null);
      setTravelMinutes("");
      setSelectedMode(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update the location.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>Update Location</h3>
        <p className="text-muted mt-8" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
          Moved from <strong>{currentPlaceName}</strong>? Search where you are now — the same
          link keeps working, and anyone who has it open will see it move live.
        </p>

        <div className="mt-16">
          <LocationSearch onSelect={setPlace} />
        </div>

        {place && (
          <div className="mt-16">
            <MapView latitude={place.latitude} longitude={place.longitude} placeName={place.name} height={200} interactive={false} />
            <div className="mt-8" style={{ fontWeight: 700, fontSize: 14 }}>📍 {place.name}</div>
            <div className="text-muted" style={{ fontSize: 12.5 }}>{place.formattedAddress}</div>

            <label className="field-label mt-16">How are you getting there?</label>
            <div className="chip-row">
              <button
                type="button"
                className={`chip${selectedMode === null ? " selected" : ""}`}
                onClick={() => setSelectedMode(null)}
              >
                Recommended
              </button>
              {MODE_OPTIONS.map((mode) => {
                const seconds = modeEstimates[mode.key];
                if (seconds == null) return null;
                return (
                  <button
                    type="button"
                    key={mode.key}
                    className={`chip${selectedMode === mode.key ? " selected" : ""}`}
                    onClick={() => setSelectedMode(mode.key)}
                  >
                    {mode.icon} {formatDuration(seconds)}
                  </button>
                );
              })}
            </div>
            {loadingModes && (
              <p className="text-faint mt-6" style={{ fontSize: 11.5 }}>Checking travel times…</p>
            )}

            <label className="field-label mt-16">Travel time (minutes) — optional</label>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              placeholder="Leave blank to estimate automatically"
              value={travelMinutes}
              onChange={(e) => setTravelMinutes(e.target.value)}
            />
            <p className="text-faint mt-6" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
              Pick how you're getting there above, or set an exact time here to override it —
              either way the map glides at that pace and along that route.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-12" style={{ color: "var(--color-danger)", fontSize: 13, fontWeight: 600 }}>
            {error}
          </p>
        )}

        <div className="flex gap-10 mt-20">
          <button className="btn btn-secondary btn-block" onClick={handleClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={!place || submitting}>
            {submitting ? <span className="spinner" /> : "Update Location"}
          </button>
        </div>
      </div>
    </div>
  );
}
