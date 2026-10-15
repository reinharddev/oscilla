"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useT } from "@/lib/i18n/use-t";

/** Score history with the two thresholds that change a machine's status. */
export function ScoreTrend({ data }: { data: number[] }) {
  const t = useT();
  const config = { score: { label: t("mach.score"), color: "var(--foreground)" } } satisfies ChartConfig;
  const points = data.map((score, i) => ({ i: i + 1, score: Math.round(score) }));
  if (points.length < 2) return null;
  return (
    <ChartContainer config={config} className="h-28 w-full">
      <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis dataKey="i" hide />
        <YAxis domain={[0, 100]} ticks={[0, 50, 75, 100]} tickLine={false} axisLine={false} width={40} />
        <ReferenceLine y={75} stroke="var(--warning)" strokeDasharray="3 3" />
        <ReferenceLine y={50} stroke="var(--destructive)" strokeDasharray="3 3" />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Line dataKey="score" type="monotone" stroke="var(--color-score)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}
