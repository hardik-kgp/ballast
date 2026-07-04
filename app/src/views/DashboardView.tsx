import { ArrowDownRight, ArrowUpRight, Flame, Gauge, IndianRupee, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveFeed, type LiveUnit } from "@/hooks/useLiveFeed";
import { Card, CardHeader, Dot, Pill } from "@/components/ui/Card";
import {
  ExposureMonthlyChart,
  GenerationChart,
  MarketPriceChart,
  VibrationChart,
} from "@/components/charts";
import { Sparkline } from "@/components/charts/Sparkline";
import { CHART_COLORS } from "@/components/charts/chartTheme";
import { FEED, type UnitStatus } from "@/data/feed";
import { formatMW } from "@/lib/format";

const pred = FEED.prediction;

const STATIC_KPIS = [
  {
    label: "Availability (90d PAF)",
    value: `${FEED.kpis.availabilityPct}%`,
    sub: "NAPAF floor 83-85%",
    delta: `+${(FEED.kpis.availabilityPct - 83).toFixed(1)} pts`,
    up: FEED.kpis.availabilityPct >= 83,
    icon: Gauge,
  },
  {
    label: "Net exposure (90d)",
    value: `\u20B9${FEED.kpis.netExposure90dCr} Cr`,
    sub: "CC lost + DSM + RTM",
    delta: pred ? `+\u20B9${pred.rupeesAtRiskCr} Cr at risk` : "",
    up: false,
    icon: IndianRupee,
  },
  {
    label: "Coal stock (min)",
    value: `${FEED.kpis.minCoalDays ?? "-"} days`,
    sub: "CEA critical below 4 days",
    delta: (FEED.kpis.minCoalDays ?? 99) < 4 ? "critical" : "adequate",
    up: (FEED.kpis.minCoalDays ?? 99) >= 4,
    icon: Flame,
  },
];

const STATUS_META: Record<UnitStatus, { label: string; tone: "success" | "warning" | "danger" | "info"; dot: string }> = {
  nominal: { label: "Nominal", tone: "success", dot: "bg-emerald-500" },
  watch: { label: "Watch", tone: "warning", dot: "bg-amber-500" },
  at_risk: { label: "At risk", tone: "danger", dot: "bg-rose-500" },
  maintenance: { label: "Maintenance", tone: "info", dot: "bg-sky-500" },
};

function UnitCard({ unit }: { unit: LiveUnit }) {
  const meta = STATUS_META[unit.status];
  const sparkColor =
    unit.status === "at_risk"
      ? CHART_COLORS.rose
      : unit.status === "watch"
        ? CHART_COLORS.amber
        : unit.status === "maintenance"
          ? CHART_COLORS.blue
          : CHART_COLORS.green;
  return (
    <Card
      className={cn(
        "px-4 pb-3 pt-3.5 transition-colors duration-200",
        unit.status === "at_risk" && "border-rose-300",
        unit.status === "watch" && "border-amber-300"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="heading-tight text-[13.5px] font-semibold text-text">{unit.name}</p>
        <Pill tone={meta.tone}>
          <Dot className={meta.dot} />
          {meta.label}
        </Pill>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-text-subtle">
        {unit.status === "nominal" ? unit.plantId : `Watch item: ${unit.worstEquip ?? "none"}`}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          key={unit.loadMw}
          className="tabular animate-tick text-[22px] font-semibold tracking-[-0.02em] text-text"
        >
          {unit.loadMw}
        </span>
        <span className="text-xs text-text-subtle">/ {Math.round(unit.capacityMw)} MW</span>
        {unit.delta !== 0 ? (
          <span
            className={cn(
              "tabular ml-auto text-[10.5px] font-medium",
              unit.delta > 0 ? "text-emerald-600" : "text-text-subtle"
            )}
          >
            {unit.delta > 0 ? "+" : ""}
            {unit.delta} MW
          </span>
        ) : null}
      </div>
      <div className="mt-1">
        <Sparkline values={unit.loadTrend} color={sparkColor} />
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border pt-2.5 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-text-subtle">Health</dt>
          <dd className={cn("tabular mt-0.5 text-[13px] font-semibold", unit.healthIndex < 50 ? "text-rose-600" : unit.healthIndex < 75 ? "text-amber-600" : "text-text")}>
            {unit.healthIndex}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-text-subtle">Risk</dt>
          <dd className={cn("tabular mt-0.5 text-[13px] font-semibold", unit.riskPct >= 60 ? "text-rose-600" : unit.riskPct >= 25 ? "text-amber-600" : "text-text")}>
            {unit.riskPct}%
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-text-subtle">Vib</dt>
          <dd className={cn("tabular mt-0.5 text-[13px] font-semibold", unit.vibrationMmS >= FEED.meta.vibAlert ? "text-rose-600" : unit.vibrationMmS >= 3.5 ? "text-amber-600" : "text-text")}>
            {unit.vibrationMmS.toFixed(1)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export function DashboardView() {
  const live = useLiveFeed();

  const kpis = [
    {
      label: "Fleet output",
      value: formatMW(live.fleetLoadMw),
      sub: `vs ${formatMW(FEED.kpis.declaredMw)} declared`,
      delta: `${(((live.fleetLoadMw - FEED.kpis.declaredMw) / FEED.kpis.declaredMw) * 100).toFixed(1)}%`,
      up: live.fleetLoadMw >= FEED.kpis.declaredMw,
      icon: Zap,
      live: true,
    },
    ...STATIC_KPIS.map((kpi) => ({ ...kpi, live: false })),
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="heading-tight text-[20px] font-semibold tracking-[-0.025em] text-text">
            Fleet overview
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {FEED.meta.plantCount} plants · {FEED.meta.unitCount} units ·{" "}
            {formatMW(FEED.meta.installedMw)} installed · operator {FEED.meta.operator}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11.5px] font-medium text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live telemetry
          <span className="tabular text-emerald-600/80">
            {live.secondsSinceUpdate === 0 ? "just now" : `${live.secondsSinceUpdate}s ago`}
          </span>
        </span>
      </div>

      <div className="grid animate-fade-up grid-cols-2 gap-4 xl:grid-cols-4" style={{ animationDelay: "60ms" }}>
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="px-5 pb-4 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-text-muted">{kpi.label}</p>
                <Icon className="h-4 w-4 text-text-subtle" aria-hidden="true" />
              </div>
              <p
                key={kpi.live ? kpi.value : kpi.label}
                className={cn(
                  "tabular mt-2 text-[26px] font-semibold tracking-[-0.02em] text-text",
                  kpi.live && "animate-tick"
                )}
              >
                {kpi.value}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[11px] font-semibold",
                    kpi.up ? "text-emerald-700" : "text-rose-600"
                  )}
                >
                  {kpi.up ? (
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                  )}
                  {kpi.delta}
                </span>
                <span className="text-[11px] text-text-subtle">{kpi.sub}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid animate-fade-up gap-4 xl:grid-cols-5" style={{ animationDelay: "120ms" }}>
        <Card className="pb-4 xl:col-span-3">
          <CardHeader
            title="Schedule vs actual generation"
            subtitle="Last 24 hours across the fleet. Red bars are shortfall blocks."
            right={
              <Pill tone="warning">
                <Dot className="bg-amber-500" />
                DSM at stake
              </Pill>
            }
          />
          <div className="px-4 pt-2">
            <GenerationChart height={272} />
          </div>
        </Card>
        <Card className="pb-4 xl:col-span-2">
          <CardHeader
            title={pred ? `${pred.equipName} vibration` : "Vibration trend"}
            subtitle={
              pred
                ? `${pred.unitId} · fails in ~${Math.round(pred.rulDays)}d (${pred.confidencePct}% conf)`
                : "No active prediction"
            }
            right={
              pred ? (
                <Pill tone="danger">
                  <Dot className="bg-rose-500 animate-pulse-dot" />
                  {"\u20B9"}{pred.rupeesAtRiskCr} Cr
                </Pill>
              ) : undefined
            }
          />
          <div className="px-4 pt-2">
            <VibrationChart height={272} />
          </div>
        </Card>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="heading-tight text-[15px] font-semibold text-text">Units</h3>
          <p className="text-xs text-text-subtle">
            Load, health index, failure risk, worst-asset vibration (mm/s)
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
          {live.units.map((unit) => (
            <UnitCard key={unit.unitId} unit={unit} />
          ))}
        </div>
      </div>

      <div className="grid animate-fade-up gap-4 xl:grid-cols-2" style={{ animationDelay: "240ms" }}>
        <Card className="pb-4">
          <CardHeader
            title="IEX prices, last 24 hours"
            subtitle="Day-ahead vs real-time. Replacement power is bought on these curves."
          />
          <div className="px-4 pt-2">
            <MarketPriceChart height={250} />
          </div>
        </Card>
        <Card className="pb-4">
          <CardHeader
            title="Monthly commercial exposure"
            subtitle="Capacity charge lost, DSM penalties and RTM replacement (Cr)"
          />
          <div className="px-4 pt-2">
            <ExposureMonthlyChart height={250} />
          </div>
        </Card>
      </div>
    </div>
  );
}
