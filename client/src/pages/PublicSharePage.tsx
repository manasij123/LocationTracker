import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import MapView from "../components/MapView";
import Skeleton from "../components/Skeleton";
import { getPublicShare, recordShareOpen } from "../services/shares";
import { useCountdown } from "../hooks/useCountdown";
import { useToast } from "../hooks/useToast";
import { formatClock } from "../utils/format";
import { openDirections } from "../utils/directions";
import { ApiRequestError } from "../services/api";
import type { PublicShare } from "../types";

const LOCATION_POLL_MS = 15_000;

export default function PublicSharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { show } = useToast();
  const [share, setShare] = useState<PublicShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const openRecorded = useRef(false);
  const knownPlaceName = useRef<string | null>(null);

  useEffect(() => {
    if (!shareId) return;
    getPublicShare(shareId)
      .then((d) => {
        setShare(d.share);
        knownPlaceName.current = d.share.placeName;
        if (d.share.status === "active" && !openRecorded.current) {
          openRecorded.current = true;
          recordShareOpen(shareId).catch(() => {});
        }
      })
      .catch((e) => setError(e instanceof ApiRequestError ? e.message : "This share link is invalid."))
      .finally(() => setLoading(false));
  }, [shareId]);

  // While the share is active, poll so the creator moving to a new spot (same link) shows up
  // here live — without the recipient needing to reload the page.
  useEffect(() => {
    if (!shareId || share?.status !== "active") return;

    const interval = setInterval(() => {
      getPublicShare(shareId)
        .then((d) => {
          setShare(d.share);
          if (d.share.status === "active" && d.share.placeName !== knownPlaceName.current) {
            knownPlaceName.current = d.share.placeName;
            show(`Location updated: now at ${d.share.placeName}`, "info");
          }
        })
        .catch(() => {
          // A transient network hiccup shouldn't interrupt the page — just try again next tick.
        });
    }, LOCATION_POLL_MS);

    return () => clearInterval(interval);
  }, [shareId, share?.status, show]);

  const remainingMs = useCountdown(share?.status === "active" ? share.expiresAt : null);

  useEffect(() => {
    if (share?.status === "active" && remainingMs === 0) {
      // Countdown hit zero client-side — re-check with the server, which is authoritative.
      if (shareId) getPublicShare(shareId).then((d) => setShare(d.share)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <header style={{ padding: "18px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>📍</span> SpotShare
        </div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>Shared Location</div>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 40px" }}>
        {loading && (
          <div className="flex-col gap-16">
            <Skeleton height={320} radius={16} />
            <Skeleton height={60} radius={12} />
          </div>
        )}

        {!loading && (error || !share) && (
          <div className="empty-state">
            <div className="empty-icon">🚫</div>
            <div className="empty-title">This share link is invalid.</div>
            <p style={{ fontSize: 13.5 }}>Double-check the link, or ask for a new one.</p>
          </div>
        )}

        {!loading && share && share.status === "revoked" && (
          <div className="empty-state">
            <div className="empty-icon">🚫</div>
            <div className="empty-title">This location link is no longer available.</div>
          </div>
        )}

        {!loading && share && share.status === "expired" && (
          <div className="empty-state">
            <div className="empty-icon">⏰</div>
            <div className="empty-title">Location Expired</div>
            <p style={{ fontSize: 13.5 }}>This shared location is no longer active.</p>
          </div>
        )}

        {!loading && share && share.status === "active" && share.latitude != null && share.longitude != null && (
          <>
            <MapView
              latitude={share.latitude}
              longitude={share.longitude}
              placeName={share.placeName}
              label={`ME AT: ${share.placeName}`}
              history={share.locationHistory}
              overrideDurationSeconds={share.locationHistory?.[share.locationHistory.length - 1]?.travelDurationSeconds ?? null}
              overrideTravelMode={share.locationHistory?.[share.locationHistory.length - 1]?.travelMode ?? null}
              allowFullscreen
              height={340}
            />

            <div className="card card-pad mt-16">
              <div className="text-faint" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                Me at
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 4 }}>📍 {share.placeName}</div>
              <div className="text-muted mt-8" style={{ fontSize: 13.5 }}>{share.formattedAddress}</div>
            </div>

            <div className="card card-pad mt-16" style={{ textAlign: "center" }}>
              <div className="text-muted" style={{ fontSize: 13 }}>Available for</div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4 }}>
                {formatClock(remainingMs)}
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg btn-block mt-16"
              onClick={() => openDirections(share.latitude as number, share.longitude as number, share.placeName)}
            >
              🧭 Get Directions
            </button>

            {share.note && (
              <div className="card card-pad mt-16">
                <div className="text-faint" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                  Additional instructions
                </div>
                <p style={{ fontSize: 14, marginTop: 6 }}>{share.note}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
