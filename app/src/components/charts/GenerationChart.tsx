import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FEED, type GenerationPoint } from "@/data/feed";
import { useLiveSeries } from "@/hooks/useLiveSeries";
import { formatMW } from "@/lib/format";
import { AXIS_PROPS, CHART_COLORS } from "./chartTheme";
import { ChartLegend } from "./chartChrome";
import { buildTooltip } from "./buildTooltip";

const anchor = FEED.generation24h[FEED.generation24h.length - 1];

function resampleLastBlock(last: GenerationPoint): GenerationPoint {
  const drift = (Math.random() * 2 - 1) * anchor.scheduledMw * 0.003;
  const pull = (anchor.actualMw - last.actualMw) * 0.2;
  const actualMw = Math.round(last.actualMw + drift + pull);
  return {
    ...last,
    actualMw,
    shortfallMw: Math.max(0, Math.round(last.scheduledMw - actualMw)),
  };
}

const TooltipContent = buildTooltip((name, value) => {
  if (name === "actualMw")
    return { name: "Actual generation", value: formatMW(value), color: CHART_COLORS.blue };
  if (name === "scheduledMw")
    return { name: "Scheduled", value: formatMW(value), color: CHART_COLORS.green };
  if (name === "shortfallMw")
    return value > 0
      ? { name: "Shortfall", value: formatMW(value), color: CHART_COLORS.rose }
      : null;
  return null;
});

export function GenerationChart({ height = 260 }: { height?: number }) {
  const data = useLiveSeries(FEED.generation24h, resampleLastBlock);
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="genFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" interval={3} {...AXIS_PROPS} />
          <YAxis
            domain={["dataMin - 150", "dataMax + 100"]}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
            width={40}
            {...AXIS_PROPS}
          />
          <Tooltip content={<TooltipContent />} cursor={{ stroke: CHART_COLORS.axis, strokeOpacity: 0.3 }} />
          <Area
            dataKey="actualMw"
            type="monotone"
            stroke={CHART_COLORS.blue}
            strokeWidth={2.5}
            fill="url(#genFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="scheduledMw"
            type="monotone"
            stroke={CHART_COLORS.green}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Bar
            dataKey="shortfallMw"
            barSize={12}
            radius={[3, 3, 0, 0]}
            fill={CHART_COLORS.rose}
            fillOpacity={0.85}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        live
        items={[
          { label: "Actual generation (MW)", color: CHART_COLORS.blue },
          { label: "Scheduled", color: CHART_COLORS.green, dashed: true },
          { label: "Shortfall", color: CHART_COLORS.rose },
        ]}
      />
    </div>
  );
}
