import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBg: "blue" | "green" | "amber" | "gray" | "red";
  trend?: number;
  trendLabel?: string;
}

export default function StatCard({ label, value, icon: Icon, iconBg, trend, trendLabel }: StatCardProps) {
  return (
    <div className="card stat-card">
      <div className="stat-top">
        <div className={`stat-icon icon-bg-${iconBg}`}><Icon size={18} /></div>
        {typeof trend === "number" && (
          <span className={`stat-trend ${trend >= 0 ? "up" : "down"}`}>
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {trendLabel && <div className="text-faint" style={{ fontSize: 11 }}>{trendLabel}</div>}
    </div>
  );
}
