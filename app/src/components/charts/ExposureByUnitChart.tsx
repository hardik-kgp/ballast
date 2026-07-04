import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FEED } from "@/data/feed";
import { formatCrore } from "@/lib/format";
import { AXIS_PROPS, CHART_COLORS } from "./chartTheme";
import { ChartLegend } from "./chartChrome";
import { buildTooltip } from "./buildTooltip";

const TooltipContent = buildTooltip((name, value) => {
  if (name === "ccLostCr")
    return { name: "Capacity charge lost", value: formatCrore(value), color: CHART_COLORS.blue };
  if (name === "dsmCr")
    return { name: "DSM penalty", value: formatCrore(value), color: CHART_COLORS.amber };
  if (name === "rtmCr")
    return { name: "RTM replacement", value: formatCrore(value), color: CHART_COLORS.rose };
  return null;
});

export function ExposureByUnitChart({ height = 260 }: { height?: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={FEED.exposureByUnit} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="unitId" {...AXIS_PROPS} />
          <YAxis tickFormatter={(v: number) => `\u20B9${v}`} width={40} {...AXIS_PROPS} />
          <Tooltip content={<TooltipContent />} cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.45 }} />
          <Bar dataKey="ccLostCr" stackId="unit" fill={CHART_COLORS.blue} fillOpacity={0.8} barSize={34} />
          <Bar dataKey="dsmCr" stackId="unit" fill={CHART_COLORS.amber} fillOpacity={0.85} barSize={34} />
          <Bar
            dataKey="rtmCr"
            stackId="unit"
            fill={CHART_COLORS.rose}
            fillOpacity={0.85}
            barSize={34}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: "Capacity charge lost (90d, Cr)", color: CHART_COLORS.blue },
          { label: "DSM penalty", color: CHART_COLORS.amber },
          { label: "RTM replacement", color: CHART_COLORS.rose },
        ]}
      />
    </div>
  );
}
