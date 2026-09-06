import { useEffect, useState } from "react";
import ShareActivityChart from "../components/charts/ShareActivityChart";
import DeviceBreakdown from "../components/charts/DeviceBreakdown";
import Skeleton from "../components/Skeleton";
import { getDashboardStats } from "../services/dashboard";
import { ApiRequestError } from "../services/api";
import type { DashboardStats } from "../types";

const RANGES = [7, 30, 90];

export default function Analytics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [range, setRange] = useState(7);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardStats(range)
      .then(setStats)
      .catch((e) => setError(e instanceof ApiRequestError ? e.message : "Something went wrong."));
  }, [range]);

  return (
    <div>
      <h1 className="page-title">Analytics</h1>
      <p className="page-subtitle">See how your shared locations are performing.</p>

      {error && <p className="mt-16" style={{ color: "var(--color-danger)", fontSize: 13.5 }}>{error}</p>}

      {!stats && !error && (
        <div className="section flex-col gap-16">
          <Skeleton height={140} radius={16} />
          <Skeleton height={220} radius={16} />
        </div>
      )}

      {stats && stats.totalShares === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📈</div>
          <div className="empty-title">Not enough activity to show analytics.</div>
          <p style={{ fontSize: 13.5 }}>Share a location to start collecting data.</p>
        </div>
      )}

      {stats && stats.totalShares > 0 && (
        <>
          <div className="grid grid-2 section">
            <div className="card card-pad">
              <div className="stat-label">Total Shares</div>
              <div className="stat-value">{stats.totalShares}</div>
            </div>
            <div className="card card-pad">
              <div className="stat-label">Link Opens</div>
              <div className="stat-value">{stats.totalOpens}</div>
              <div className="text-muted" style={{ fontSize: 12.5 }}>Unique: {stats.uniqueVisitors}</div>
            </div>
          </div>

          <div className="section card card-pad">
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
            <ShareActivityChart data={stats.shareActivity} />
          </div>

          <div className="grid grid-2 section">
            <div className="card card-pad">
              <h2 className="section-title mb-12">Active vs Expired</h2>
              <div className="flex-col gap-10">
                <MiniStat label="Active" value={stats.activeShares} color="var(--color-success)" />
                <MiniStat label="Expired" value={stats.expiredShares} color="var(--color-neutral)" />
                <MiniStat label="Revoked" value={stats.revokedShares} color="var(--color-danger)" />
              </div>
            </div>
            <div className="card card-pad">
              <h2 className="section-title mb-16">Device Breakdown</h2>
              <DeviceBreakdown data={stats.deviceBreakdown} />
            </div>
          </div>
        </>
      )}
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
