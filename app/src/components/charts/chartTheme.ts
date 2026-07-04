export const CHART_COLORS = {
  green: "hsl(160 84% 30%)",
  blue: "hsl(224 72% 50%)",
  amber: "hsl(32 90% 46%)",
  violet: "hsl(262 60% 52%)",
  rose: "hsl(347 77% 50%)",
  grid: "hsl(220 13% 91%)",
  axis: "hsl(220 9% 55%)",
};

export const AXIS_PROPS = {
  stroke: CHART_COLORS.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export interface TooltipRow {
  name: string;
  value: string;
  color: string;
}
