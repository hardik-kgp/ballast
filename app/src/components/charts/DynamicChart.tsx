import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AskChart } from "@/lib/askApi";
import { AXIS_PROPS, CHART_COLORS } from "./chartTheme";
import { ChartLegend } from "./chartChrome";
import { buildTooltip } from "./buildTooltip";

const PALETTE = [
  CHART_COLORS.blue,
  CHART_COLORS.amber,
  CHART_COLORS.green,
  CHART_COLORS.violet,
  CHART_COLORS.rose,
];

function formatValue(value: number) {
  if (Math.abs(value) >= 10000) return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function DynamicChart({
  chart,
  columns,
  rows,
  height = 260,
}: {
  chart: AskChart;
  columns: string[];
  rows: (string | number | null)[][];
  height?: number;
}) {
  const data = rows.map((row) => {
    const record: Record<string, string | number | null> = {};
    columns.forEach((col, i) => {
      record[col] = row[i];
    });
    return record;
  });

  const colorOf = (key: string) => PALETTE[chart.series.indexOf(key) % PALETTE.length];
  const TooltipContent = buildTooltip((name, value) =>
    chart.series.includes(name)
      ? { name: name.replace(/_/g, " "), value: formatValue(value), color: colorOf(name) }
      : null
  );

  const interval = Math.max(0, Math.ceil(data.length / 12) - 1);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={chart.x} interval={interval} {...AXIS_PROPS} />
          <YAxis tickFormatter={(v: number) => formatValue(v)} width={52} {...AXIS_PROPS} />
          <Tooltip
            content={<TooltipContent />}
            cursor={
              chart.type === "bar"
                ? { fill: CHART_COLORS.grid, fillOpacity: 0.45 }
                : { stroke: CHART_COLORS.axis, strokeOpacity: 0.3 }
            }
          />
          {chart.series.map((key) => {
            const color = colorOf(key);
            if (chart.type === "bar") {
              return (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId={chart.stacked ? "stack" : undefined}
                  fill={color}
                  fillOpacity={0.85}
                  barSize={Math.max(8, Math.min(34, Math.floor(560 / Math.max(1, data.length)))) }
                  radius={[3, 3, 0, 0]}
                />
              );
            }
            if (chart.type === "area") {
              return (
                <Area
                  key={key}
                  dataKey={key}
                  type="monotone"
                  stroke={color}
                  strokeWidth={2.5}
                  fill={color}
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              );
            }
            return (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        items={chart.series.map((key) => ({
          label: key.replace(/_/g, " "),
          color: colorOf(key),
        }))}
      />
    </div>
  );
}
