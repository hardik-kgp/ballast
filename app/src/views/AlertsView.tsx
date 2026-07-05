import { useMemo, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  CircleDollarSign,
  Cpu,
  Factory,
  Flame,
  LineChart,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Dot } from "@/components/ui/Card";
import { timeAgo } from "@/lib/format";
import { MitigationDialog } from "@/components/MitigationDialog";
import { ALERTS, type AlertKind, type AlertSeverity, type PlantAlert } from "@/data/alerts";

const SEVERITY_META: Record<AlertSeverity, { label: string; className: string; dot: string }> = {
  critical: {
    label: "Critical",
    className: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
  high: {
    label: "High",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  normal: {
    label: "Normal",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  low: {
    label: "Low",
    className: "bg-slate-50 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
};

const KIND_META: Record<AlertKind, { label: string; icon: typeof Cpu }> = {
  predictive: { label: "Predictive", icon: TrendingUp },
  threshold: { label: "Threshold", icon: LineChart },
  market: { label: "Commercial", icon: CircleDollarSign },
  fuel: { label: "Fuel", icon: Flame },
  emission: { label: "Emission", icon: Factory },
};

type FilterKey = "all" | "critical" | "predictive" | "operational";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "predictive", label: "Predictive" },
  { key: "operational", label: "Operational" },
];

const matchesFilter = (alert: PlantAlert, key: FilterKey) => {
  switch (key) {
    case "all":
      return true;
    case "critical":
      return alert.severity === "critical" || alert.severity === "high";
    case "predictive":
      return alert.kind === "predictive";
    case "operational":
      return alert.kind !== "predictive";
  }
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, high: 1, normal: 2, low: 3 };

function SeverityPill({ severity }: { severity: AlertSeverity }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={cn(
        "inline-flex h-[19px] items-center gap-1 rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
        meta.className
      )}
    >
      <Dot className={meta.dot} />
      {meta.label}
    </span>
  );
}

function AlertCard({ alert, onReview }: { alert: PlantAlert; onReview: () => void }) {
  const KindIcon = KIND_META[alert.kind].icon;
  return (
    <Card
      className={cn(
        "px-5 py-4 transition-colors duration-200",
        alert.severity === "critical" && "border-rose-300",
        alert.severity === "high" && "border-amber-300"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={alert.severity} />
        <span className="inline-flex h-[19px] items-center gap-1 rounded-full border border-border-strong bg-surface-overlay px-2 text-[10px] font-medium text-text-muted">
          <KindIcon className="h-3 w-3" aria-hidden="true" />
          {KIND_META[alert.kind].label}
        </span>
        <span className="inline-flex h-[19px] items-center rounded-full border border-border-strong bg-surface-overlay px-2 text-[10px] font-medium text-text-muted">
          {alert.unit}
        </span>
        <span className="ml-auto text-[11px] tabular text-text-subtle">
          {timeAgo(alert.raisedMinutesAgo)}
        </span>
      </div>

      <h3 className="heading-tight mt-2.5 text-[15px] font-semibold leading-snug text-text">
        {alert.title}
      </h3>
      <p className="mt-1.5 max-w-[860px] text-[13px] leading-relaxed text-text-muted">
        {alert.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-text-muted">
        {alert.equipName ? (
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-text-subtle" aria-hidden="true" />
            {alert.equipName}
          </span>
        ) : null}
        {alert.impactCr !== undefined ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-rose-600">
            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
            {"\u20B9"}{alert.impactCr} Cr at stake
          </span>
        ) : null}
      </div>

      {alert.recommendation ? (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/60 px-3.5 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              Recommended action
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-text">{alert.recommendation}</p>
          </div>
          <button
            type="button"
            onClick={onReview}
            className="ml-auto inline-flex shrink-0 items-center gap-1 self-center rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors duration-150 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Review
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </Card>
  );
}

export function AlertsView() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [mitigationOpen, setMitigationOpen] = useState(false);

  const filtered = useMemo(
    () =>
      ALERTS.filter((alert) => matchesFilter(alert, filter)).sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      ),
    [filter]
  );

  const criticalCount = ALERTS.filter((a) => a.severity === "critical").length;
  const totalAtStake = ALERTS.reduce((sum, a) => sum + (a.impactCr ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="heading-tight text-[20px] font-semibold tracking-[-0.025em] text-text">
            Alerts
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {ALERTS.length} active · {criticalCount} critical · {"\u20B9"}
            {totalAtStake.toFixed(2)} Cr at stake if unaddressed
          </p>
        </div>
        <div
          className="flex items-center gap-1 rounded-full border border-border bg-surface p-1"
          role="group"
          aria-label="Filter alerts"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.key
                  ? "bg-surface-overlay text-text"
                  : "text-text-muted hover:text-text"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3.5">
        {filtered.map((alert, index) => (
          <div
            key={alert.id}
            className="animate-fade-up"
            style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
          >
            <AlertCard alert={alert} onReview={() => setMitigationOpen(true)} />
          </div>
        ))}
        {filtered.length === 0 ? (
          <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <BellRing className="h-8 w-8 text-text-subtle" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text">No alerts in this view</p>
            <p className="mt-1 text-xs text-text-muted">
              Switch filters to see the rest of the queue.
            </p>
          </Card>
        ) : null}
      </div>

      <MitigationDialog open={mitigationOpen} onClose={() => setMitigationOpen(false)} />
    </div>
  );
}
