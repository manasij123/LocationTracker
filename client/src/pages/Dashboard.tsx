import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { MapPin, Radio, Eye, Clock, Map, TrendingUp, ClipboardList, Inbox } from "lucide-react";
import StatCard from "../components/StatCard";
import ActivityListItem from "../components/ActivityListItem";
import Skeleton from "../components/Skeleton";
import ShareActivityChart from "../components/charts/ShareActivityChart";
import { getDashboardStats } from "../services/dashboard";
import { getActivity } from "../services/activity";
import { listShares } from "../services/shares";
import type { ActivityEvent, DashboardStats, Share } from "../types";
import { greeting } from "../utils/format";
import { ApiRequestError } from "../services/api";

const RANGES = [7, 30, 90];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [activeShares, setActiveShares] = useState<Share[] | null>(null);
  const [range, setRange] = useState(7);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardStats(range)
      .then((d) => !cancelled && setStats(d))
      .catch((e) => !cancelled && setError(e instanceof ApiRequestError ? e.message : "Something went wrong"));
    return () => {
      cancelled = true;
    };
  }, [range]);

  useEffect(() => {
    getActivity().then((d) => setActivity(d.events.slice(0, 5))).catch(() => setActivity([]));
    listShares({ status: "active" }).then((d) => setActiveShares(d.shares)).catch(() => setActiveShares([]));
  }, []);

  const expiringSoon = activeShares?.filter((s) => s.remainingMs < 15 * 60_000).length ?? 0;
  const activeNow = (activeShares?.length ?? 0) - expiringSoon;

  return (
    <div>
      <div className="flex justify-between items-center" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">{greeting()}</h1>
          <p className="page-subtitle">Manage your shared locations</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => navigate("/share-location")}>
          + Share New Location
        </button>
      </div>

      {error && (
        <div className="card card-pad mt-20" style={{ borderColor: "var(--color-danger)" }}>
          <p style={{ color: "var(--color-danger)", fontWeight: 600, fontSize: 14 }}>{error}</p>
        </div>
      )}

      <div className="grid grid-stats mt-24">
        {stats ? (
          <>
            <StatCard label="Total Shares" value={stats.totalShares} icon={MapPin} iconBg="blue" trend={stats.trends.shares} trendLabel="from last month" />
            <StatCard label="Active Shares" value={stats.activeShares} icon={Radio} iconBg="green" trendLabel="Currently available" />
            <StatCard label="Link Opens" value={stats.totalOpens} icon={Eye} iconBg="amber" trend={stats.trends.opens} trendLabel="from last month" />
            <StatCard label="Expired Shares" value={stats.expiredShares} icon={Clock} iconBg="gray" trendLabel="Completed" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={120} radius={16} />)
        )}
      </div>

      <div className="section">
        <div className="card card-pad">
          <div className="section-header">
            <h2 className="section-title">Share Activity</h2>
            <div className="chip-row">
              {RANGES.map((r) => (
                <button key={r} className={`chip${range === r ? " selected" : ""}`} onClick={() => setRange(r)}>
                  {r} Days
                </button>
              ))}
            </div>
          </div>
          {stats ? <ShareActivityChart data={stats.shareActivity} /> : <Skeleton height={220} radius={12} />}
        </div>
      </div>

      <div className="grid grid-2 section">
        <div className="card card-pad">
          <h2 className="section-title mb-12">Active Locations</h2>
          {activeShares ? (
            <div className="flex-col gap-12">
              <MiniStat label="Active now" value={activeNow} color="var(--color-success)" />
              <MiniStat label="Expiring soon" value={expiringSoon} color="var(--color-warning)" />
              <MiniStat label="Expired" value={stats?.expiredShares ?? 0} color="var(--color-neutral)" />
            </div>
          ) : (
            <Skeleton height={90} radius={12} />
          )}
        </div>
        <div className="card card-pad">
          <h2 className="section-title mb-12">Link Opens</h2>
          {stats ? (
            <div>
              <div className="stat-value">{stats.totalOpens}</div>
              <div className="text-muted" style={{ fontSize: 13 }}>Unique: {stats.uniqueVisitors}</div>
            </div>
          ) : (
            <Skeleton height={60} radius={12} />
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Quick Actions</h2>
        </div>
        <div className="grid grid-stats">
          <QuickAction icon={MapPin} label="Share Location" onClick={() => navigate("/share-location")} highlight />
          <QuickAction icon={Map} label="My Locations" onClick={() => navigate("/locations")} />
          <QuickAction icon={TrendingUp} label="View Analytics" onClick={() => navigate("/analytics")} />
          <QuickAction icon={ClipboardList} label="Activity Log" onClick={() => navigate("/activity")} />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Activity</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/activity")}>See all</button>
        </div>
        <div className="card card-pad">
          {activity === null ? (
            <div className="flex-col gap-12">
              <Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} />
            </div>
          ) : activity.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 12px" }}>
              <div className="empty-icon"><Inbox size={40} /></div>
              <div className="empty-title">No activity yet</div>
              <p style={{ fontSize: 13 }}>Share a location to see activity here.</p>
            </div>
          ) : (
            activity.map((event) => <ActivityListItem key={event.id} event={event} />)
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-8">
        <span className="badge-dot" style={{ background: color, width: 9, height: 9 }} />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
      </div>
      <span style={{ fontSize: 16, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, highlight }: { icon: LucideIcon; label: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      className="card"
      onClick={onClick}
      style={{
        padding: 18,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10,
        cursor: "pointer",
        border: highlight ? "1.5px solid var(--color-primary)" : undefined,
        background: highlight ? "var(--color-primary-light)" : undefined,
      }}
    >
      <Icon size={22} />
      <span style={{ fontSize: 13.5, fontWeight: 700, textAlign: "left" }}>{label}</span>
    </button>
  );
}
