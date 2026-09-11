import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import LocationSearch from "../components/LocationSearch";
import DurationPicker from "../components/DurationPicker";
import MapView from "../components/MapView";
import { createShare } from "../services/shares";
import { ApiRequestError } from "../services/api";
import { useToast } from "../hooks/useToast";
import type { PlaceResult } from "../types";

const MAX_NOTE_LENGTH = 200;

export default function ShareLocation() {
  const navigate = useNavigate();
  const { show } = useToast();

  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | "custom">(60);
  const [customMinutes, setCustomMinutes] = useState(60);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resolvedMinutes = durationMinutes === "custom" ? customMinutes : durationMinutes;

  async function handleGenerate() {
    if (!place) {
      setFormError("Please select a location first.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const { share } = await createShare({
        placeName: place.name,
        formattedAddress: place.formattedAddress,
        latitude: place.latitude,
        longitude: place.longitude,
        providerPlaceId: place.placeId,
        note: note.trim() || null,
        durationMinutes: resolvedMinutes,
      });
      show("Share link created", "success");
      navigate(`/share-location/result/${share.id}`);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <h1 className="page-title">Share a Location</h1>
      <p className="page-subtitle">Choose where your pickup or meeting point is.</p>

      <div className="section">
        <label className="field-label">Where should they meet you?</label>
        <LocationSearch onSelect={setPlace} />
      </div>

      {place && (
        <div className="section">
          <MapView latitude={place.latitude} longitude={place.longitude} placeName={place.name} height={300} />
          <div className="card card-pad mt-12 flex justify-between items-center">
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5, display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={15} /> {place.name}
              </div>
              <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{place.formattedAddress}</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setPlace(null)}>Change</button>
          </div>
        </div>
      )}

      <div className="section">
        <label className="field-label">How long will they be there?</label>
        <DurationPicker
          selectedMinutes={durationMinutes}
          onSelect={setDurationMinutes}
          customMinutes={customMinutes}
          onCustomMinutesChange={setCustomMinutes}
        />
      </div>

      <div className="section">
        <label className="field-label">Additional instructions</label>
        <textarea
          className="textarea"
          placeholder="Example: Come near the main gate."
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="char-count">{note.length}/{MAX_NOTE_LENGTH}</div>
      </div>

      {formError && (
        <div className="card card-pad mt-16" style={{ borderColor: "var(--color-danger)" }}>
          <p style={{ color: "var(--color-danger)", fontSize: 13.5, fontWeight: 600 }}>{formError}</p>
        </div>
      )}

      <div className="sticky-action">
        <button className="btn btn-primary btn-lg btn-block" onClick={handleGenerate} disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner" /> Creating link...
            </>
          ) : (
            "Generate Share Link"
          )}
        </button>
      </div>
    </div>
  );
}
