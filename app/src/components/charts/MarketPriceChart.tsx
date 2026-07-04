import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FEED } from "@/data/feed";
import { AXIS_PROPS, CHART_COLORS } from "./chartTheme";
import { ChartLegend } from "./chartChrome";
import { buildTooltip } from "./buildTooltip";

const TooltipContent = buildTooltip((name, value) => {
  if (name === "damRs")
    return { name: "Day-ahead (DAM)", value: `\u20B9${value.toFixed(2)}/kWh`, color: CHART_COLORS.blue };
  if (name === "rtmRs")
    return { name: "Real-time (RTM)", value: `\u20B9${value.toFixed(2)}/kWh`, color: CHART_COLORS.violet };
  return null;
});

export function MarketPriceChart({ height = 260 }: { height?: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={FEED.marketPrices24h} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" interval={3} {...AXIS_PROPS} />
          <YAxis tickFormatter={(v: number) => `\u20B9${v}`} width={42} {...AXIS_PROPS} />
          <Tooltip content={<TooltipContent />} cursor={{ stroke: CHART_COLORS.axis, strokeOpacity: 0.3 }} />
          <Line
            dataKey="damRs"
            type="monotone"
            stroke={CHART_COLORS.blue}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Line
            dataKey="rtmRs"
            type="monotone"
            stroke={CHART_COLORS.violet}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: "IEX day-ahead (Rs/kWh)", color: CHART_COLORS.blue },
          { label: "IEX real-time (Rs/kWh)", color: CHART_COLORS.violet },
        ]}
      />
    </div>
  );
}
