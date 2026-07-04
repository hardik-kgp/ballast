import type { TooltipProps } from "recharts";
import { ChartTooltip } from "./chartChrome";
import type { TooltipRow } from "./chartTheme";

type RechartsTooltipProps = TooltipProps<number, string>;

export function buildTooltip(
  format: (name: string, value: number) => TooltipRow | null,
  labelFormat?: (label: unknown) => string
) {
  return function BoundTooltip({ active, payload, label }: RechartsTooltipProps) {
    const rows = (payload ?? [])
      .map((entry) =>
        entry.value === undefined || entry.name === undefined
          ? null
          : format(String(entry.name), Number(entry.value))
      )
      .filter((row): row is TooltipRow => row !== null);
    return (
      <ChartTooltip
        active={active}
        label={labelFormat ? labelFormat(label) : String(label ?? "")}
        rows={rows}
      />
    );
  };
}
