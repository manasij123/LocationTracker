import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "../../types";

function formatDateLabel(date: string) {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ShareActivityChart({ data }: { data: DailyPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatDateLabel(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--color-text-faint)" }}
          axisLine={false}
          tickLine={false}
          interval={chartData.length > 14 ? Math.floor(chartData.length / 7) : 0}
        />
        <YAxis tick={{ fontSize: 11, fill: "var(--color-text-faint)" }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
        <Tooltip
          cursor={{ fill: "rgba(37,99,235,0.08)" }}
          contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12.5 }}
          labelFormatter={(label) => label}
          formatter={(value: number) => [`${value}`, "Shares"]}
        />
        <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
