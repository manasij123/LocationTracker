import type { LucideIcon } from "lucide-react";
import { Smartphone, Monitor, HelpCircle } from "lucide-react";
import type { DeviceBreakdownEntry } from "../../types";

const deviceLabels: Record<string, string> = {
  android: "Android",
  ios: "iPhone",
  desktop: "Desktop",
  other: "Other",
};

const deviceIcons: Record<string, LucideIcon> = {
  android: Smartphone,
  ios: Smartphone,
  desktop: Monitor,
  other: HelpCircle,
};

export default function DeviceBreakdown({ data }: { data: DeviceBreakdownEntry[] }) {
  if (data.length === 0) {
    return <p className="text-muted" style={{ fontSize: 13.5 }}>Not enough opens yet to show a device breakdown.</p>;
  }

  const sorted = [...data].sort((a, b) => b.percent - a.percent);

  return (
    <div className="flex-col gap-12">
      {sorted.map((entry) => {
        const Icon = deviceIcons[entry.device] || HelpCircle;
        return (
          <div key={entry.device}>
            <div className="flex justify-between" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon size={14} /> {deviceLabels[entry.device] || entry.device}
              </span>
              <span>{entry.percent}%</span>
            </div>
            <div style={{ height: 8, background: "var(--color-surface-alt)", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${entry.percent}%`,
                  background: "var(--color-primary)",
                  borderRadius: 999,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
