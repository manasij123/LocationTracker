import { useEffect, useRef, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { useUserLocation } from "../hooks/useUserLocation";
import { searchLocations } from "../services/locations";
import { ApiRequestError } from "../services/api";
import { distanceKm, formatDistance } from "../utils/geo";
import type { PlaceResult } from "../types";

interface LocationSearchProps {
  onSelect: (place: PlaceResult) => void;
}

export default function LocationSearch({ onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const debouncedQuery = useDebounce(query, 400);
  const requestId = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { coords: userCoords, request: requestUserLocation } = useUserLocation();

  useEffect(() => {
    // Ask once, up front, so distances are ready by the time the first results show.
    // Declining the browser prompt just means results render without a distance.
    requestUserLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    searchLocations(trimmed)
      .then((res) => {
        if (requestId.current !== id) return;
        setResults(res.results);
        if (res.results.length === 0) setError("Couldn't find that location.");
      })
      .catch((err) => {
        if (requestId.current !== id) return;
        setError(err instanceof ApiRequestError ? err.message : "Something went wrong.");
        setResults([]);
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [debouncedQuery]);

  return (
    <div style={{ position: "relative" }} ref={wrapRef}>
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          className="input"
          placeholder="Search a place, address or landmark"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) {
              onSelect(results[0]);
              setShowResults(false);
            }
          }}
        />
      </div>

      {showResults && (query.trim().length >= 2) && (
        <div className="card" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 20, maxHeight: 320, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="spinner spinner-dark" />
              <span className="text-muted" style={{ fontSize: 13.5 }}>Searching…</span>
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: 16 }}>
              <p className="text-muted" style={{ fontSize: 13.5 }}>{error}</p>
            </div>
          )}
          {!loading &&
            results.map((place) => (
              <button
                key={place.placeId}
                onClick={() => {
                  onSelect(place);
                  setQuery(place.name);
                  setShowResults(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📍 {place.name}
                  </span>
                  <span
                    className="text-muted"
                    style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {place.formattedAddress}
                  </span>
                </span>
                {userCoords && (
                  <span className="text-faint" style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {formatDistance(
                      distanceKm(userCoords.latitude, userCoords.longitude, place.latitude, place.longitude)
                    )}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
