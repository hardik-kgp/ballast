import { FEED } from "@/data/feed";
import type { ChartId } from "@/data/chat";
import type { AskChart } from "@/lib/askApi";

export type Cell = string | number | null;

/** Everything the detail panel needs to render any artifact, scripted or queried. */
export interface ArtifactData {
  title: string;
  subtitle: string;
  source: string;
  sourceKind: "sql" | "feed";
  columns: string[];
  rows: Cell[][];
  /** Dynamic chart spec from the query service; type is switchable in the panel. */
  chart: AskChart | null;
  /** Fixed composite chart for scripted artifacts. */
  chartId?: ChartId;
  fileStem: string;
}

function toTable<T extends object>(records: T[]): { columns: string[]; rows: Cell[][] } {
  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  const rows = records.map((record) =>
    columns.map((col) => {
      const value = (record as Record<string, unknown>)[col];
      return typeof value === "string" || typeof value === "number" ? value : null;
    })
  );
  return { columns, rows };
}

export function feedSliceFor(chartId: ChartId): { columns: string[]; rows: Cell[][] } {
  switch (chartId) {
    case "generation_vs_schedule":
      return toTable(FEED.generation24h);
    case "vibration_trend":
      return toTable(FEED.vibrationTrend);
    case "market_prices":
      return toTable(FEED.marketPrices24h);
    case "exposure_monthly":
      return toTable(FEED.exposureMonthly);
    case "exposure_by_unit":
      return toTable(FEED.exposureByUnit);
  }
}

export interface SeriesStats {
  key: string;
  latest: number;
  min: number;
  max: number;
  avg: number;
}

export function computeStats(columns: string[], rows: Cell[][], exclude: string[]): SeriesStats[] {
  const stats: SeriesStats[] = [];
  columns.forEach((col, index) => {
    if (exclude.includes(col)) return;
    const values = rows
      .map((row) => row[index])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return;
    stats.push({
      key: col,
      latest: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    });
  });
  return stats;
}

export function formatCell(value: number): string {
  if (Math.abs(value) >= 10000) return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function downloadCsv(columns: string[], rows: Cell[][], fileStem: string) {
  const escape = (value: Cell) => {
    if (value === null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  // BOM so Excel opens UTF-8 (rupee signs, unit names) correctly.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = `${fileStem}.csv`;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}
