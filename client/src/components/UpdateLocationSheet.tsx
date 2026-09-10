import { useState } from "react";
import LocationSearch from "./LocationSearch";
import MapView from "./MapView";
import { updateShareLocation } from "../services/shares";
import { ApiRequestError } from "../services/api";
import type { PlaceResult, Share } from "../types";

interface UpdateLocationSheetProps {
  open: boolean;
  shareId: string;
  currentPlaceName: string;
  onClose: () => void;
  onUpdated: (share: Share) => void;
}

export default function UpdateLocationSheet({
  open,
  shareId,
  currentPlaceName,
  onClose,
  onUpdated,
}: UpdateLocationSheetProps) {
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [travelMinutes, setTravelMinutes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    setPlace(null);
    setTravelMinutes("");
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!place) return;
    setSubmitting(true);
    setError(null);
    try {
      const minutes = parseFloat(travelMinutes);
      const { share } = await updateShareLocation(shareId, {
        placeName: place.name,
        formattedAddress: place.formattedAddress,
        latitude: place.latitude,
        longitude: place.longitude,
        providerPlaceId: place.placeId,
        travelDurationSeconds: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : undefined,
      });
      onUpdated(share);
      setPlace(null);
      setTravelMinutes("");
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

            <label className="mt-16" style={{ display: "block", fontSize: 12.5, fontWeight: 700 }}>
              Travel time (minutes) — optional
            </label>
            <input
              className="input mt-6"
              type="number"
              min={1}
              step={1}
              placeholder="Leave blank to estimate automatically"
              value={travelMinutes}
              onChange={(e) => setTravelMinutes(e.target.value)}
            />
            <p className="text-faint mt-6" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
              By default the map estimates how long this move would realistically take (walking,
              train, driving) and glides at that pace. Set a number here to use that exact time
              instead.
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
