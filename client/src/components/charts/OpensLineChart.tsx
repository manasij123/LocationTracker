import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "../../types";

function formatDateLabel(date: string) {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function OpensLineChart({ data }: { data: DailyPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatDateLabel(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="opensFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-faint)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--color-text-faint)" }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12.5 }}
          formatter={(value: number) => [`${value}`, "Opens"]}
        />
        <Area type="monotone" dataKey="count" stroke="#16a34a" strokeWidth={2} fill="url(#opensFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
