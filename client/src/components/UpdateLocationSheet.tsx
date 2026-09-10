import { useEffect, useState } from "react";
import LocationSearch from "./LocationSearch";
import MapView from "./MapView";
import { loadGoogleMaps } from "../utils/googleMapsLoader";
import { resolveCurrentPosition, fetchRouteTimelineForSegment } from "../utils/routeTimeline";
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
  share: Share;
  onClose: () => void;
  onUpdated: (share: Share) => void;
}

export default function UpdateLocationSheet({ open, shareId, share, onClose, onUpdated }: UpdateLocationSheetProps) {
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [travelMinutes, setTravelMinutes] = useState("");
  const [modeEstimates, setModeEstimates] = useState<Partial<Record<TravelModeKey, number>>>({});
  const [selectedMode, setSelectedMode] = useState<TravelModeKey | null>(null);
  const [loadingModes, setLoadingModes] = useState(false);
  const [resolvedOrigin, setResolvedOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up how long each way of getting there would realistically take — like Google Maps'
  // own "Best / Driving / Transit / Walking" picker — so the creator can pick the mode that
  // actually matches how they're getting there instead of always auto-detecting one. If the
  // previous move's real travel time hasn't fully elapsed, estimates start from wherever the
  // creator realistically is by now instead of a destination not actually reached yet.
  useEffect(() => {
    if (!place || !GOOGLE_MAPS_API_KEY) {
      setModeEstimates({});
      setSelectedMode(null);
      setResolvedOrigin(null);
      return;
    }
    let cancelled = false;
    setLoadingModes(true);
    setSelectedMode(null);

    const lastHistoryEntry = share.locationHistory[share.locationHistory.length - 1];
    const recordedPosition = { lat: share.latitude, lng: share.longitude };

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(async () => {
        if (cancelled) return null;
        const service = new google.maps.DirectionsService();

        const origin = lastHistoryEntry
          ? await resolveCurrentPosition(service, lastHistoryEntry, recordedPosition)
          : recordedPosition;
        if (cancelled) return null;
        setResolvedOrigin(origin);

        const destination = { lat: place.latitude, lng: place.longitude };

        // Reuses the exact same fetch (traffic-aware driving, best-of-alternatives transit)
        // that the map itself uses to animate the glide, so the time shown here always matches
        // what actually plays out — never a different, roughly-similar-looking estimate.
        return Promise.all(
          MODE_OPTIONS.map((mode) =>
            fetchRouteTimelineForSegment(service, origin, destination, mode.key).then(
              (timeline): [TravelModeKey, number | null] => [mode.key, timeline?.totalDurationSeconds ?? null]
            )
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
  }, [place?.latitude, place?.longitude, share.latitude, share.longitude]);

  if (!open) return null;

  function handleClose() {
    setPlace(null);
    setTravelMinutes("");
    setSelectedMode(null);
    setResolvedOrigin(null);
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
      const { share: updatedShare } = await updateShareLocation(shareId, {
        placeName: place.name,
        formattedAddress: place.formattedAddress,
        latitude: place.latitude,
        longitude: place.longitude,
        providerPlaceId: place.placeId,
        travelDurationSeconds: manualSeconds ?? (selectedMode ? modeEstimates[selectedMode] : undefined),
        travelMode: selectedMode ?? undefined,
        fromLatitude: resolvedOrigin?.lat,
        fromLongitude: resolvedOrigin?.lng,
      });
      onUpdated(updatedShare);
      setPlace(null);
      setTravelMinutes("");
      setSelectedMode(null);
      setResolvedOrigin(null);
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
          Moved from <strong>{share.placeName}</strong>? Search where you are now — the same
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
