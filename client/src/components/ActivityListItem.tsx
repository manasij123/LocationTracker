import type { LucideIcon } from "lucide-react";
import { MapPin, Eye, Clock, Ban, RefreshCw } from "lucide-react";
import type { ActivityEvent } from "../types";
import { formatRelativeTime } from "../utils/format";

const meta: Record<ActivityEvent["type"], { icon: LucideIcon; label: string; iconBg: string }> = {
  share_created: { icon: MapPin, label: "Share created", iconBg: "icon-bg-blue" },
  link_opened: { icon: Eye, label: "Shared link opened", iconBg: "icon-bg-green" },
  share_expired: { icon: Clock, label: "Share expired", iconBg: "icon-bg-gray" },
  share_revoked: { icon: Ban, label: "Share revoked", iconBg: "icon-bg-red" },
  location_updated: { icon: RefreshCw, label: "Location updated", iconBg: "icon-bg-blue" },
};

export default function ActivityListItem({ event }: { event: ActivityEvent }) {
  const m = meta[event.type];
  return (
    <div className="activity-item">
      <div className={`activity-icon ${m.iconBg}`}><m.icon size={16} /></div>
      <div className="activity-body">
        <div className="activity-title">{m.label}</div>
        {event.placeName && <div className="activity-meta">{event.placeName}</div>}
      </div>
      <div className="activity-time">{formatRelativeTime(event.createdAt)}</div>
    </div>
  );
}
