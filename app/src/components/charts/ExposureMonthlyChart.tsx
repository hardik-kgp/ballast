import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
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
  if (name === "netCr")
    return { name: "Net exposure", value: formatCrore(value), color: CHART_COLORS.violet };
  return null;
});

export function ExposureMonthlyChart({ height = 260 }: { height?: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={FEED.exposureMonthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" {...AXIS_PROPS} />
          <YAxis tickFormatter={(v: number) => `\u20B9${v}`} width={40} {...AXIS_PROPS} />
          <Tooltip content={<TooltipContent />} cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.45 }} />
          <Bar dataKey="ccLostCr" stackId="expo" fill={CHART_COLORS.blue} fillOpacity={0.8} barSize={26} />
          <Bar dataKey="dsmCr" stackId="expo" fill={CHART_COLORS.amber} fillOpacity={0.85} barSize={26} />
          <Bar
            dataKey="rtmCr"
            stackId="expo"
            fill={CHART_COLORS.rose}
            fillOpacity={0.85}
            barSize={26}
            radius={[4, 4, 0, 0]}
          />
          <Line
            dataKey="netCr"
            type="monotone"
            stroke={CHART_COLORS.violet}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.violet }}
            activeDot={{ r: 4.5, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: "Capacity charge lost (Cr)", color: CHART_COLORS.blue },
          { label: "DSM penalty", color: CHART_COLORS.amber },
          { label: "RTM replacement", color: CHART_COLORS.rose },
          { label: "Net exposure", color: CHART_COLORS.violet },
        ]}
      />
    </div>
  );
}
