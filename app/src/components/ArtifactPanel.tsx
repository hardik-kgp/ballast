import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Tags, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartById } from "@/components/charts";
import { DynamicChart } from "@/components/charts/DynamicChart";
import { ResultTable } from "@/components/ResultTable";
import { downloadChartPng } from "@/lib/downloadChart";
import { computeStats, downloadCsv, formatCell, type ArtifactData } from "@/lib/artifact";
import type { AskChart } from "@/lib/askApi";

const CHART_TYPES: AskChart["type"][] = ["line", "area", "bar"];

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text"
      )}
    >
      {children}
    </button>
  );
}

export function ArtifactPanel({ data, onClose }: { data: ArtifactData; onClose: () => void }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<AskChart["type"] | null>(null);
  const [showLabels, setShowLabels] = useState(false);

  const dynamicChart = data.chart ? { ...data.chart, type: chartType ?? data.chart.type } : null;
  const stats = computeStats(data.columns, data.rows, dynamicChart ? [dynamicChart.x] : []);
  const hasChart = Boolean(dynamicChart || data.chartId);

  return (
    <aside
      aria-label={`Artifact details: ${data.title}`}
      className="animate-slide-in-right flex h-full w-[460px] max-w-[85vw] shrink-0 flex-col border-l border-border bg-surface"
    >
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="min-w-0">
          <h2 className="heading-tight truncate text-[13.5px] font-semibold text-text">{data.title}</h2>
          <p className="mt-0.5 truncate text-[11.5px] text-text-subtle">{data.subtitle}</p>
        </div>
        <button
          type="button"
          aria-label="Close artifact panel"
          onClick={onClose}
          className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5">
        {dynamicChart ? (
          <div
            className="flex items-center gap-0.5 rounded-md border border-border bg-surface-raised p-0.5"
            role="group"
            aria-label="Chart type"
          >
            {CHART_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={dynamicChart.type === type}
                onClick={() => setChartType(type)}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dynamicChart.type === type
                    ? "bg-surface text-text shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
                    : "text-text-muted hover:text-text"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        ) : null}
        {dynamicChart ? (
          <ToolbarButton label="Toggle value labels" active={showLabels} onClick={() => setShowLabels((v) => !v)}>
            <Tags className="h-3.5 w-3.5" aria-hidden="true" />
            Labels
          </ToolbarButton>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {hasChart ? (
            <ToolbarButton
              label="Download chart as PNG"
              onClick={() => {
                if (chartRef.current) void downloadChartPng(chartRef.current, data.fileStem);
              }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              PNG
            </ToolbarButton>
          ) : null}
          <ToolbarButton
            label="Download data as CSV"
            onClick={() => downloadCsv(data.columns, data.rows, data.fileStem)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </ToolbarButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasChart ? (
          <div ref={chartRef} className="border-b border-border px-4 pb-3 pt-4">
            {dynamicChart ? (
              <DynamicChart
                chart={dynamicChart}
                columns={data.columns}
                rows={data.rows}
                height={280}
                showLabels={showLabels}
              />
            ) : data.chartId ? (
              <ChartById id={data.chartId} height={280} />
            ) : null}
          </div>
        ) : null}

        {stats.length > 0 ? (
          <div className="border-b border-border px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-text-subtle">
              Series summary
            </p>
            <div className="mt-2 space-y-2">
              {stats.map((s) => (
                <div key={s.key} className="rounded-md border border-border bg-surface-raised px-3 py-2">
                  <p className="text-[11px] font-medium text-text">{s.key.replace(/_/g, " ")}</p>
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {(
                      [
                        ["Latest", s.latest],
                        ["Min", s.min],
                        ["Avg", s.avg],
                        ["Max", s.max],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</p>
                        <p className="tabular mt-0.5 text-[12.5px] font-semibold text-text">
                          {formatCell(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="px-1 py-2">
          <p className="px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-subtle">
            Data · {data.rows.length} rows
          </p>
          <ResultTable columns={data.columns} rows={data.rows} maxRows={200} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-surface-raised px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-subtle">
          {data.sourceKind === "sql" ? "Executed SQL" : "Source"}
        </p>
        <p
          className={cn(
            "mt-1 max-h-24 overflow-y-auto break-words text-[11px] leading-relaxed text-text-muted",
            data.sourceKind === "sql" && "font-mono"
          )}
        >
          {data.source}
        </p>
      </footer>
    </aside>
  );
}
