import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import ActivityListItem from "../components/ActivityListItem";
import Skeleton from "../components/Skeleton";
import { getActivity } from "../services/activity";
import { ApiRequestError } from "../services/api";
import type { ActivityEvent } from "../types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "shares", label: "Shares" },
  { key: "opens", label: "Opens" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

function dayHeading(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export default function Activity() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getActivity(filter)
      .then((d) => setEvents(d.events))
      .catch((e) => setError(e instanceof ApiRequestError ? e.message : "Something went wrong."));
  }, [filter]);

  const groups: { heading: string; items: ActivityEvent[] }[] = [];
  if (events) {
    for (const event of events) {
      const heading = dayHeading(event.createdAt);
      const group = groups.find((g) => g.heading === heading);
      if (group) group.items.push(event);
      else groups.push({ heading, items: [event] });
    }
  }

  return (
    <div>
      <h1 className="page-title">Activity</h1>
      <p className="page-subtitle">A chronological log of everything happening with your shares.</p>

      <div className="section chip-row">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip${filter === f.key ? " selected" : ""}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="section">
        {error && <p style={{ color: "var(--color-danger)", fontSize: 13.5 }}>{error}</p>}
        {events === null && !error && (
          <div className="card card-pad flex-col gap-12">
            <Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} />
          </div>
        )}
        {events && events.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><Inbox size={40} /></div>
            <div className="empty-title">No activity yet.</div>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.heading}>
            <div className="activity-day-heading">{group.heading}</div>
            <div className="card card-pad">
              {group.items.map((event) => (
                <ActivityListItem key={event.id} event={event} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
