import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicShare } from "../services/shares";
import { useCountdown } from "../hooks/useCountdown";
import { useToast } from "../hooks/useToast";
import { formatClock, formatTime } from "../utils/format";
import type { PublicShare } from "../types";
import Skeleton from "../components/Skeleton";
import { getPublicOrigin } from "../utils/publicOrigin";

export default function ShareResult() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { show } = useToast();
  const [share, setShare] = useState<PublicShare | null>(null);

  useEffect(() => {
    if (!shareId) return;
    getPublicShare(shareId).then((d) => setShare(d.share)).catch(() => setShare(null));
  }, [shareId]);

  const remainingMs = useCountdown(share?.expiresAt);
  const shareUrl = `${getPublicOrigin()}/share/${shareId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      show("Link copied to clipboard", "success");
    } catch {
      show("Couldn't copy the link", "error");
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "SpotShare location", text: "Here's where to meet me", url: shareUrl });
      } catch {
        // user cancelled the native share sheet — nothing to do
      }
    } else {
      copyLink();
    }
  }

  if (!share) {
    return (
      <div className="flex-col gap-16" style={{ maxWidth: 420, margin: "40px auto" }}>
        <Skeleton height={80} radius={40} width={80} />
        <Skeleton height={24} />
        <Skeleton height={120} radius={16} />
      </div>
    );
  }

  return (
    <div className="page-fade-in" style={{ maxWidth: 420, margin: "20px auto", textAlign: "center" }}>
      <div className="success-check">✓</div>
      <h1 className="page-title mt-16">Your location link is ready</h1>

      <div className="card card-pad mt-24" style={{ textAlign: "left" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>📍 {share.placeName}</div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>{share.formattedAddress}</div>

        <hr className="divider" />

        <div className="flex justify-between">
          <span className="text-muted" style={{ fontSize: 13 }}>Available for</span>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{formatClock(remainingMs)}</span>
        </div>
        <div className="flex justify-between mt-8">
          <span className="text-muted" style={{ fontSize: 13 }}>Expires</span>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{formatTime(share.expiresAt)}</span>
        </div>

        <div className="link-row mt-16">
          <span className="link-text">{shareUrl}</span>
        </div>
      </div>

      <div className="flex-col gap-10 mt-20">
        <button className="btn btn-primary btn-lg btn-block" onClick={copyLink}>Copy Link</button>
        <button className="btn btn-secondary btn-lg btn-block" onClick={nativeShare}>Share</button>
        <button className="btn btn-outline btn-lg btn-block" onClick={() => window.open(shareUrl, "_blank")}>Open</button>
      </div>

      <button className="btn btn-ghost mt-24" onClick={() => navigate("/locations")}>
        Go to My Locations
      </button>
    </div>
  );
}
