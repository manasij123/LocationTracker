import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MapView from "../components/MapView";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import UpdateLocationSheet from "../components/UpdateLocationSheet";
import Skeleton from "../components/Skeleton";
import OpensLineChart from "../components/charts/OpensLineChart";
import DeviceBreakdown from "../components/charts/DeviceBreakdown";
import { getShareAnalytics, revokeShare } from "../services/shares";
import { useCountdown } from "../hooks/useCountdown";
import { useToast } from "../hooks/useToast";
import { ApiRequestError } from "../services/api";
import { formatClock, formatDateTime, formatRelativeTime } from "../utils/format";
import { downloadLiveTrackReportPdf } from "../utils/liveTrackReport";
import type { ShareAnalytics } from "../types";

export default function LocationDetails() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { show } = useToast();
  const [data, setData] = useState<ShareAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  function load() {
    if (!shareId) return;
    getShareAnalytics(shareId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiRequestError ? e.message : "Something went wrong."));
  }

  useEffect(load, [shareId]);

  const remainingMs = useCountdown(data?.share.status === "active" ? data.share.expiresAt : null);

  async function handleRevoke() {
    if (!shareId) return;
    setRevoking(true);
    try {
      await revokeShare(shareId);
      show("Location revoked", "success");
      setConfirmOpen(false);
      load();
    } catch (e) {
      show(e instanceof ApiRequestError ? e.message : "Couldn't revoke this share.", "error");
    } finally {
      setRevoking(false);
    }
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-title">{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate("/locations")}>Back to My Locations</button>
      </div>
    );
  }

  if (!data) {
    return <Skeleton height={400} radius={16} />;
  }

  const { share } = data;
  const shareUrl = `${window.location.origin}/share/${share.id}`;

  return (
    <div>
      <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="page-title">{share.isLive ? "📡" : "📍"} {share.placeName}</h1>
          <div className="mt-8"><StatusBadge status={share.status} /></div>
        </div>
        {share.status === "active" && (
          <div className="flex gap-8">
            {!share.isLive && (
              <button className="btn btn-secondary" onClick={() => setUpdateOpen(true)}>Update Location</button>
            )}
            <button className="btn btn-danger" onClick={() => setConfirmOpen(true)}>
              {share.isLive ? "Stop Sharing" : "Revoke"}
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <MapView
          latitude={share.latitude}
          longitude={share.longitude}
          placeName={share.placeName}
          history={share.locationHistory}
          liveTrack={share.liveTrack}
          isLiveTracking={share.isLive && share.status === "active"}
          overrideDurationSeconds={share.locationHistory?.[share.locationHistory.length - 1]?.travelDurationSeconds ?? null}
          overrideTravelMode={share.locationHistory?.[share.locationHistory.length - 1]?.travelMode ?? null}
          height={280}
        />
      </div>

      {share.liveTrack.length > 0 && (
        <div className="section card card-pad">
          <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: 10 }}>
            <h2 className="section-title">
              {share.status === "active" ? "🔴 Live Trail" : "Recorded Trail"}
            </h2>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadLiveTrackReportPdf(share)}>
              ⬇ Download Report (PDF)
            </button>
          </div>
          <div className="grid grid-2 mt-12" style={{ gap: 10 }}>
            <div>
              <div className="stat-value" style={{ fontSize: 22 }}>{share.liveTrack.length}</div>
              <div className="text-faint" style={{ fontSize: 11.5 }}>Recorded Points</div>
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: 22 }}>
                {share.liveTrack.filter((p) => p.waitPointLabel != null).length}
              </div>
              <div className="text-faint" style={{ fontSize: 11.5 }}>Wait Points</div>
            </div>
          </div>
          <div className="text-muted mt-12" style={{ fontSize: 12.5 }}>
            First point: {formatDateTime(share.liveTrack[0].recordedAt)} · Last point:{" "}
            {formatDateTime(share.liveTrack[share.liveTrack.length - 1].recordedAt)}
          </div>
        </div>
      )}

      <div className="grid grid-2 section">
        <div className="card card-pad">
          <h2 className="section-title mb-12">Availability</h2>
          {share.status === "active" ? (
            <div className="stat-value">{formatClock(remainingMs)}</div>
          ) : (
            <p className="text-muted" style={{ fontSize: 14 }}>This share is {share.status}.</p>
          )}
          <div className="flex justify-between mt-16" style={{ fontSize: 13 }}>
            <span className="text-muted">Created</span>
            <span style={{ fontWeight: 700 }}>{formatDateTime(share.createdAt)}</span>
          </div>
          <div className="flex justify-between mt-8" style={{ fontSize: 13 }}>
            <span className="text-muted">Expires</span>
            <span style={{ fontWeight: 700 }}>{formatDateTime(share.expiresAt)}</span>
          </div>
          {share.note && (
            <>
              <hr className="divider" />
              <div className="text-faint" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Instructions</div>
              <p style={{ fontSize: 13.5, marginTop: 6 }}>{share.note}</p>
            </>
          )}
        </div>

        <div className="card card-pad">
          <h2 className="section-title mb-12">Link Analytics</h2>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div>
              <div className="stat-value" style={{ fontSize: 22 }}>{data.totalOpens}</div>
              <div className="text-faint" style={{ fontSize: 11.5 }}>Total Opens</div>
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: 22 }}>{data.uniqueVisitors}</div>
              <div className="text-faint" style={{ fontSize: 11.5 }}>Unique Visitors</div>
            </div>
          </div>
          <div className="text-muted mt-12" style={{ fontSize: 12.5 }}>
            Last opened: {data.lastOpened ? formatRelativeTime(data.lastOpened) : "Never"}
          </div>
        </div>
      </div>

      <div className="section card card-pad">
        <h2 className="section-title mb-12">Link Opens</h2>
        {data.totalOpens > 0 ? (
          <OpensLineChart data={data.dailyOpens} />
        ) : (
          <p className="text-muted" style={{ fontSize: 13.5 }}>Not enough activity to show analytics.</p>
        )}
      </div>

      {data.deviceBreakdown.length > 0 && (
        <div className="section card card-pad">
          <h2 className="section-title mb-16">Device Breakdown</h2>
          <DeviceBreakdown data={data.deviceBreakdown} />
        </div>
      )}

      <div className="section flex gap-10" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={() => window.open(shareUrl, "_blank")}>Open</button>
        <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(shareUrl).then(() => show("Link copied", "success"))}>Copy Link</button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={share.isLive ? "Stop sharing your location?" : "Revoke this location?"}
        description={
          share.isLive
            ? "The link will immediately stop showing your location to anyone who has it. Your recorded trail stays available here."
            : "This link will stop working immediately."
        }
        confirmLabel={share.isLive ? "Stop Sharing" : "Revoke"}
        danger
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setConfirmOpen(false)}
      />

      <UpdateLocationSheet
        open={updateOpen}
        shareId={share.id}
        share={share}
        onClose={() => setUpdateOpen(false)}
        onUpdated={() => {
          setUpdateOpen(false);
          show("Location updated — anyone with the link will see it move", "success");
          load();
        }}
      />
    </div>
  );
}
