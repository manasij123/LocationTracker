import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MapView from "../components/MapView";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import Skeleton from "../components/Skeleton";
import OpensLineChart from "../components/charts/OpensLineChart";
import DeviceBreakdown from "../components/charts/DeviceBreakdown";
import { getShareAnalytics, revokeShare } from "../services/shares";
import { useCountdown } from "../hooks/useCountdown";
import { useToast } from "../hooks/useToast";
import { ApiRequestError } from "../services/api";
import { formatClock, formatDateTime, formatRelativeTime } from "../utils/format";
import type { ShareAnalytics } from "../types";

export default function LocationDetails() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { show } = useToast();
  const [data, setData] = useState<ShareAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

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
          <h1 className="page-title">📍 {share.placeName}</h1>
          <div className="mt-8"><StatusBadge status={share.status} /></div>
        </div>
        {share.status === "active" && (
          <button className="btn btn-danger" onClick={() => setConfirmOpen(true)}>Revoke</button>
        )}
      </div>

      <div className="section">
        <MapView latitude={share.latitude} longitude={share.longitude} placeName={share.placeName} height={280} />
      </div>

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
        title="Revoke this location?"
        description="This link will stop working immediately."
        confirmLabel="Revoke"
        danger
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
