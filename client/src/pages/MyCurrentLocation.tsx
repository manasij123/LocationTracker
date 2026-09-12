import { useEffect, useState } from "react";
import { Radio, Circle, Download } from "lucide-react";
import MapView from "../components/MapView";
import ConfirmDialog from "../components/ConfirmDialog";
import { useLiveShare } from "../hooks/useLiveShare";
import { useToast } from "../hooks/useToast";
import { downloadLiveTrackReportPdf } from "../utils/liveTrackReport";
import { getCurrentPositionOnce, isNativeApp, type GeoCoords } from "../utils/nativeGeolocation";
import { getPublicOrigin } from "../utils/publicOrigin";

export default function MyCurrentLocation() {
  const { status, error, share, coords, start, stop } = useLiveShare();
  const { show } = useToast();
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [previewCoords, setPreviewCoords] = useState<GeoCoords | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isSharing = status === "sharing" && !!share;

  // Before the creator even taps "Share Realtime Location", show them a quick preview of where
  // that would put them on the map — a plain one-shot fix, not the continuous watcher `start()`
  // kicks off, so it costs nothing if they never press the button.
  useEffect(() => {
    if (isSharing) return;
    let cancelled = false;
    getCurrentPositionOnce()
      .then((point) => {
        if (!cancelled) setPreviewCoords(point);
      })
      .catch(() => {
        if (!cancelled) setPreviewError("Couldn't get your current location for a preview.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSharing]);

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

  return (
    <div>
      <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Radio size={22} /> My Current Location
      </h1>
      <p className="text-muted mt-8" style={{ fontSize: 14 }}>
        {isNativeApp
          ? "Share your live location with anyone — the link updates continuously as you move, even while the app is in the background or your screen is off."
          : "Share your live location with anyone — the link updates continuously as you move, for as long as this tab stays open and in the foreground."}
      </p>

      {!isSharing && (
        <div className="card card-pad section" style={{ textAlign: "center" }}>
          {previewCoords ? (
            <div style={{ margin: "-4px -4px 0", borderRadius: 12, overflow: "hidden" }}>
              <MapView
                latitude={previewCoords.latitude}
                longitude={previewCoords.longitude}
                placeName="Your current location"
                height={200}
                interactive={false}
              />
            </div>
          ) : previewError ? (
            <>
              <div style={{ display: "flex", justifyContent: "center", color: "var(--color-primary)" }}>
                <Circle size={36} fill="currentColor" />
              </div>
              <p className="text-muted mt-8" style={{ fontSize: 13 }}>{previewError}</p>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 0" }}>
              <span className="spinner spinner-dark" />
              <p className="text-muted" style={{ fontSize: 13 }}>Getting your current location…</p>
            </div>
          )}
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
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <Download size={16} /> Download Report (PDF)
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
