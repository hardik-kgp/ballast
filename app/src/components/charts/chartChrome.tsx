import type { TooltipRow } from "./chartTheme";

export function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string;
  rows: TooltipRow[];
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-overlay/95 px-3 py-2.5 shadow-xl backdrop-blur">
      {label ? (
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
          {label}
        </p>
      ) : null}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="text-text-muted">{row.name}</span>
            <span className="ml-auto pl-4 font-semibold tabular text-text">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartLegend({
  items,
  live,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
  live?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pt-3">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"
        >
          {item.dashed ? (
            <span
              className="h-0 w-4 border-t-2 border-dashed"
              style={{ borderColor: item.color }}
            />
          ) : (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          )}
          {item.label}
        </span>
      ))}
      {live ? (
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
          Live
        </span>
      ) : null}
    </div>
  );
}
