import {
  Area,
  ComposedChart,
  CartesianGrid,
  ReferenceLine,
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
  if (name === "vibMmS")
    return { name: "Vibration", value: `${value.toFixed(2)} mm/s`, color: CHART_COLORS.amber };
  return null;
});

export function VibrationChart({ height = 260 }: { height?: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={FEED.vibrationTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="vibFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.amber} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_COLORS.amber} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" interval={6} {...AXIS_PROPS} />
          <YAxis
            domain={[0, Math.ceil(FEED.meta.vibDanger + 1)]}
            tickFormatter={(v: number) => `${v}`}
            width={30}
            {...AXIS_PROPS}
          />
          <Tooltip content={<TooltipContent />} cursor={{ stroke: CHART_COLORS.axis, strokeOpacity: 0.3 }} />
          <ReferenceLine
            y={FEED.meta.vibAlert}
            stroke={CHART_COLORS.amber}
            strokeOpacity={0.7}
            strokeDasharray="4 4"
            label={{
              value: `Alert ${FEED.meta.vibAlert}`,
              position: "insideBottomRight",
              fill: CHART_COLORS.amber,
              fontSize: 10,
            }}
          />
          <ReferenceLine
            y={FEED.meta.vibDanger}
            stroke={CHART_COLORS.rose}
            strokeWidth={1.5}
            label={{
              value: `Danger ${FEED.meta.vibDanger}`,
              position: "insideTopRight",
              fill: CHART_COLORS.rose,
              fontSize: 10,
            }}
          />
          <Area
            dataKey="vibMmS"
            type="monotone"
            stroke={CHART_COLORS.amber}
            strokeWidth={2.5}
            fill="url(#vibFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: "Overall vibration (mm/s, ISO 10816)", color: CHART_COLORS.amber },
          { label: "Alert band", color: CHART_COLORS.amber, dashed: true },
          { label: "Danger / trip", color: CHART_COLORS.rose, dashed: true },
        ]}
      />
    </div>
  );
}
