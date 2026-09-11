import { useState } from "react";
import MapView from "../components/MapView";
import ConfirmDialog from "../components/ConfirmDialog";
import { useLiveShare } from "../hooks/useLiveShare";
import { useToast } from "../hooks/useToast";
import { downloadLiveTrackReportPdf } from "../utils/liveTrackReport";
import { isNativeApp } from "../utils/nativeGeolocation";
import { getPublicOrigin } from "../utils/publicOrigin";

export default function MyCurrentLocation() {
  const { status, error, share, coords, start, stop } = useLiveShare();
  const { show } = useToast();
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);

  const shareUrl = share ? `${getPublicOrigin()}/share/${share.id}` : null;

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      show("Link copied to clipboard", "success");
    } catch {
      show("Couldn't copy the link", "error");
    }
  }

  async function nativeShare() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My live location", text: "Track my location in real time", url: shareUrl });
      } catch {
        // user cancelled the native share sheet — nothing to do
      }
    } else {
      copyLink();
    }
  }

  async function handleStop() {
    setStopping(true);
    try {
      await stop();
      show("Live sharing stopped", "success");
    } finally {
      setStopping(false);
      setStopConfirmOpen(false);
    }
  }

  const isSharing = status === "sharing" && !!share;

  return (
    <div>
      <h1 className="page-title">📡 My Current Location</h1>
      <p className="text-muted mt-8" style={{ fontSize: 14 }}>
        {isNativeApp
          ? "Share your live location with anyone — the link updates continuously as you move, even while the app is in the background or your screen is off."
          : "Share your live location with anyone — the link updates continuously as you move, for as long as this tab stays open and in the foreground."}
      </p>

      {!isSharing && (
        <div className="card card-pad section" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36 }}>🔵</div>
          <h2 className="section-title mt-12">Not currently sharing</h2>
          <p className="text-muted mt-8" style={{ fontSize: 13.5 }}>
            {isNativeApp
              ? "Starting live sharing will use your device's real GPS location and keep sending updates in the background (shown as a persistent notification) until you stop it."
              : "Starting live sharing will use your browser's real GPS location and keep sending updates while this page (or app) stays open, until you stop it."}
          </p>
          {error && (
            <p style={{ color: "var(--color-danger, #dc2626)", fontSize: 13, marginTop: 10 }}>{error}</p>
          )}
          <button
            className="btn btn-primary btn-lg mt-16"
            onClick={start}
            disabled={status === "requesting"}
          >
            {status === "requesting" ? <span className="spinner" /> : "Share Realtime Location"}
          </button>
        </div>
      )}

      {isSharing && coords && (
        <>
          <div className="section">
            <MapView
              latitude={coords.latitude}
              longitude={coords.longitude}
              placeName="My Location"
              label="🔵 YOU ARE HERE"
              liveTrack={share.liveTrack}
              isLiveTracking
              allowFullscreen
              height={340}
            />
          </div>

          <div className="card card-pad section">
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15, color: "#dc2626" }}>
              <span className="live-pulse-dot" /> LIVE — sharing your location
            </div>
            <div className="link-row mt-16">
              <span className="link-text">{shareUrl}</span>
            </div>
            <div className="flex-col gap-10 mt-16">
              <button className="btn btn-primary btn-block" onClick={copyLink}>Copy Link</button>
              <button className="btn btn-secondary btn-block" onClick={nativeShare}>Share</button>
              <button
                className="btn btn-secondary btn-block"
                onClick={() => downloadLiveTrackReportPdf(share)}
                disabled={share.liveTrack.length === 0}
              >
                ⬇ Download Report (PDF)
              </button>
              <button className="btn btn-danger btn-block" onClick={() => setStopConfirmOpen(true)}>
                Stop Sharing
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={stopConfirmOpen}
        title="Stop sharing your location?"
        description="The link will immediately stop showing your location to anyone who has it."
        confirmLabel="Stop Sharing"
        danger
        loading={stopping}
        onConfirm={handleStop}
        onCancel={() => setStopConfirmOpen(false)}
      />
    </div>
  );
}
