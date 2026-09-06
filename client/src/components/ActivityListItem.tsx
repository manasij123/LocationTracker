import type { ActivityEvent } from "../types";
import { formatRelativeTime } from "../utils/format";

const meta: Record<ActivityEvent["type"], { icon: string; label: string; iconBg: string }> = {
  share_created: { icon: "📍", label: "Share created", iconBg: "icon-bg-blue" },
  link_opened: { icon: "👁", label: "Shared link opened", iconBg: "icon-bg-green" },
  share_expired: { icon: "⏰", label: "Share expired", iconBg: "icon-bg-gray" },
  share_revoked: { icon: "🚫", label: "Share revoked", iconBg: "icon-bg-red" },
};

export default function ActivityListItem({ event }: { event: ActivityEvent }) {
  const m = meta[event.type];
  return (
    <div className="activity-item">
      <div className={`activity-icon ${m.iconBg}`}>{m.icon}</div>
      <div className="activity-body">
        <div className="activity-title">{m.label}</div>
        {event.placeName && <div className="activity-meta">{event.placeName}</div>}
      </div>
      <div className="activity-time">{formatRelativeTime(event.createdAt)}</div>
    </div>
  );
}
