import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import { formatDateTime, formatTime } from "../utils/format";
import { useToast } from "../hooks/useToast";
import type { Share } from "../types";

interface ShareCardProps {
  share: Share;
  onRevoke: (share: Share) => void;
}

export default function ShareCard({ share, onRevoke }: ShareCardProps) {
  const navigate = useNavigate();
  const { show } = useToast();
  const shareUrl = `${window.location.origin}/share/${share.id}`;

  async function copyLink(e: MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      show("Link copied to clipboard", "success");
    } catch {
      show("Couldn't copy the link", "error");
    }
  }

  async function nativeShare(e: MouseEvent) {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({ title: "SpotShare location", url: shareUrl });
      } catch {
        // cancelled
      }
    } else {
      copyLink(e);
    }
  }

  return (
    <div className="card card-pad" style={{ cursor: "pointer" }} onClick={() => navigate(`/locations/${share.id}`)}>
      <div className="flex justify-between items-center">
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {share.isLive ? "📡" : "📍"} {share.placeName}
          {share.isLive && share.status === "active" && (
            <span style={{ marginLeft: 8, color: "#dc2626", fontSize: 11.5, fontWeight: 800 }}>
              <span className="live-pulse-dot" style={{ marginRight: 4 }} />LIVE
            </span>
          )}
        </div>
        <StatusBadge status={share.status} />
      </div>
      <div className="text-muted mt-8" style={{ fontSize: 12.5 }}>{share.formattedAddress}</div>

      <div className="flex gap-16 mt-16" style={{ flexWrap: "wrap" }}>
        <MetaField
          label={share.status === "active" ? "Available until" : "Ended"}
          value={formatTime(share.expiresAt)}
        />
        <MetaField label="Link opens" value={String(share.linkOpens)} />
        <MetaField label="Created" value={formatDateTime(share.createdAt)} />
      </div>

      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm" onClick={() => window.open(shareUrl, "_blank")}>Open</button>
        <button className="btn btn-secondary btn-sm" onClick={copyLink}>Copy</button>
        <button className="btn btn-secondary btn-sm" onClick={nativeShare}>Share</button>
        {share.status === "active" && (
          <button className="btn btn-danger btn-sm" onClick={() => onRevoke(share)}>Revoke</button>
        )}
      </div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-faint" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
