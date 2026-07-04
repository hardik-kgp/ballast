import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Gauge,
  PackageSearch,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Pill } from "@/components/ui/Card";
import { FEED, type FeedMaintenance } from "@/data/feed";

const SOP_LIBRARY: { title: string; file: string; scope: string }[] = [
  { title: "BFP O&M Manual", file: "manuals/BFP-OM-Manual.pdf", scope: "Boiler feed pumps, CEP, CW pumps" },
  { title: "Coal Mill O&M Manual", file: "manuals/CoalMill-OM-Manual.pdf", scope: "Bowl mills A-F" },
  { title: "Fan O&M Manual", file: "manuals/Fan-OM-Manual.pdf", scope: "ID, FD and PA fans" },
  { title: "Turbine-Generator O&M Manual", file: "manuals/TurbineGenerator-OM-Manual.pdf", scope: "Steam turbine and generator" },
  { title: "CBM Vibration SOP (ISO 10816)", file: "manuals/CBM-Vibration-SOP.pdf", scope: "Alert and danger bands, escalation" },
  { title: "Master PM Schedule", file: "manuals/MaintenanceSchedule-Master.pdf", scope: "Fleet-wide preventive calendar" },
  { title: "RCA: Boiler Tube Leak", file: "manuals/RCA-BoilerTubeLeak.pdf", scope: "Root cause analysis reference" },
];

function healthTone(health: number) {
  if (health < 50) return { bar: "bg-rose-500", text: "text-rose-700" };
  if (health < 75) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-emerald-500", text: "text-emerald-700" };
}

function HealthBar({ health }: { health: number }) {
  const tone = healthTone(health);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-overlay">
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${health}%` }} />
      </div>
      <span className={cn("tabular text-[12px] font-semibold", tone.text)}>{health}</span>
    </div>
  );
}

function SopLink({ sop, compact }: { sop: { title: string; file: string }; compact?: boolean }) {
  return (
    <a
      href={`/${sop.file}`}
      target="_blank"
      rel="noreferrer"
      title={sop.title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface font-medium text-text-muted transition-colors duration-150",
        "hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
      )}
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      {compact ? "SOP" : sop.title}
    </a>
  );
}

function PredictionCard({ item }: { item: FeedMaintenance }) {
  const p = item.prediction;
  if (!p) return null;
  const urgent = p.rulDays <= 7;
  return (
    <Card className={cn("px-5 py-4", urgent && "border-rose-300")}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={urgent ? "danger" : "warning"}>
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {p.failureMode.replace(/_/g, " ")}
        </Pill>
        <span className="inline-flex h-[19px] items-center rounded-full border border-border-strong bg-surface-overlay px-2 text-[10px] font-medium text-text-muted">
          {item.unitId}
        </span>
        <span className="ml-auto text-[11px] tabular text-text-subtle">
          {p.confidencePct.toFixed(0)}% confidence
        </span>
      </div>

      <h3 className="heading-tight mt-2.5 text-[15px] font-semibold text-text">
        {item.name} <span className="font-normal text-text-subtle">({item.equipId})</span>
      </h3>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-text-subtle">Remaining life</p>
          <p className={cn("tabular mt-0.5 text-[17px] font-semibold", urgent ? "text-rose-700" : "text-text")}>
            {p.rulDays.toFixed(0)} days
          </p>
          <p className="text-[11px] text-text-subtle">fails ~{p.predictedFailureDate}</p>
        </div>
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-text-subtle">Exposure</p>
          <p className="tabular mt-0.5 text-[17px] font-semibold text-text">
            {"\u20B9"}{p.rupeesAtRiskCr} Cr
          </p>
          <p className="text-[11px] text-text-subtle">if it trips unmanaged</p>
        </div>
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-text-subtle">Condition</p>
          <p className="tabular mt-0.5 text-[17px] font-semibold text-text">{item.vibrationMmS} mm/s</p>
          <p className="text-[11px] text-text-subtle">health {item.healthIndex}/100</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px]">
        {item.standby ? (
          <Pill tone={item.standby.available ? "success" : "danger"}>
            Standby {item.standby.equipId.split("-").slice(-2).join("-")}{" "}
            {item.standby.available ? "available" : "unavailable"}
          </Pill>
        ) : null}
        {item.spare ? (
          <Pill tone={item.spare.onHandQty > 0 ? "success" : "danger"}>
            <PackageSearch className="h-3 w-3" aria-hidden="true" />
            Spare {item.spare.onHandQty > 0 ? `${item.spare.onHandQty} on hand` : `0 on hand, ${item.spare.leadTimeDays}d lead`}
          </Pill>
        ) : null}
        {item.openWorkOrder ? (
          <Pill tone="info">
            <Wrench className="h-3 w-3" aria-hidden="true" />
            {item.openWorkOrder.woId} {item.openWorkOrder.status.replace(/_/g, " ")}
          </Pill>
        ) : null}
      </div>

      <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/60 px-3.5 py-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
            Recommended action
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-text">
            {p.recommendedAction.replace(/\s*\u2014\s*/g, ", ")}
          </p>
        </div>
        <span className="ml-auto shrink-0 self-center">
          <SopLink sop={item.sop} />
        </span>
      </div>
    </Card>
  );
}

function AssetRow({ item }: { item: FeedMaintenance }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${item.name}`}
            className="flex items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <Chevron className="h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
            <span>
              <span className="block text-[12.5px] font-medium text-text">{item.name}</span>
              <span className="block text-[10.5px] text-text-subtle">{item.equipId}</span>
            </span>
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-[12px] text-text-muted">{item.unitId}</td>
        <td className="px-3 py-2">
          <HealthBar health={item.healthIndex} />
        </td>
        <td className="tabular whitespace-nowrap px-3 py-2 text-[12px] text-text">
          {item.vibrationMmS > 0 ? `${item.vibrationMmS} mm/s` : "-"}
        </td>
        <td className="tabular whitespace-nowrap px-3 py-2 text-[12px] text-text">
          {item.prediction ? (
            <span className={cn("font-semibold", item.prediction.rulDays <= 7 ? "text-rose-700" : "text-amber-700")}>
              {item.prediction.rulDays.toFixed(0)}d
            </span>
          ) : (
            "-"
          )}
        </td>
        <td className="tabular whitespace-nowrap px-3 py-2 text-[12px] text-text-muted">
          {item.nextPmDue ?? "-"}
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <SopLink sop={item.sop} compact />
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-border/60 bg-surface-raised/60 last:border-0">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid gap-x-8 gap-y-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-text-subtle">Bearing temp</p>
                <p className="tabular mt-0.5 text-text">
                  {item.bearingTempC > 0 ? `${item.bearingTempC}\u00B0C` : "-"}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-text-subtle">Criticality / redundancy</p>
                <p className="mt-0.5 text-text">
                  Class {item.criticality}
                  {item.redundancy ? ` · ${item.redundancy}` : ""}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-text-subtle">Open work order</p>
                <p className="mt-0.5 text-text">
                  {item.openWorkOrder
                    ? `${item.openWorkOrder.woId} · ${item.openWorkOrder.status.replace(/_/g, " ")} (${item.openWorkOrder.priority})`
                    : "None"}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-text-subtle">Critical spare</p>
                <p className="mt-0.5 text-text">
                  {item.spare
                    ? `${item.spare.name}: ${item.spare.onHandQty} on hand${item.spare.poEta ? `, PO lands ${item.spare.poEta}` : ""}`
                    : "None tracked"}
                </p>
              </div>
            </div>
            {item.openWorkOrder ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-text-muted">
                {item.openWorkOrder.description.replace(/\s*\u2014\s*/g, ", ")}
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function MaintenanceView() {
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const items = FEED.maintenance;

  const units = useMemo(() => [...new Set(items.map((m) => m.unitId))].sort(), [items]);
  const filtered = useMemo(
    () => items.filter((m) => unitFilter === "all" || m.unitId === unitFilter),
    [items, unitFilter]
  );

  const predictions = items.filter((m) => m.prediction);
  const totalAtRisk = predictions.reduce((sum, m) => sum + (m.prediction?.rupeesAtRiskCr ?? 0), 0);
  const degraded = items.filter((m) => m.healthIndex < 75).length;

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="heading-tight text-[20px] font-semibold tracking-[-0.025em] text-text">
            Predictive maintenance
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {items.length} monitored assets · {predictions.length} active findings · {degraded} degraded ·{" "}
            {"\u20B9"}{totalAtRisk.toFixed(2)} Cr at risk
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-1"
          role="group"
          aria-label="Filter by unit"
        >
          {["all", ...units].map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={unitFilter === unit}
              onClick={() => setUnitFilter(unit)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                unitFilter === unit ? "bg-surface-overlay text-text" : "text-text-muted hover:text-text"
              )}
            >
              {unit === "all" ? "All units" : unit.replace("VSTPS-", "")}
            </button>
          ))}
        </div>
      </div>

      <section aria-labelledby="findings-heading" className="mt-6">
        <h3
          id="findings-heading"
          className="heading-tight flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-subtle"
        >
          <Gauge className="h-4 w-4" aria-hidden="true" />
          Model findings
        </h3>
        <div className="mt-3 space-y-3.5">
          {predictions
            .filter((m) => unitFilter === "all" || m.unitId === unitFilter)
            .map((item, index) => (
              <div
                key={item.equipId}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <PredictionCard item={item} />
              </div>
            ))}
          {predictions.filter((m) => unitFilter === "all" || m.unitId === unitFilter).length === 0 ? (
            <Card className="px-5 py-6 text-center">
              <p className="text-sm font-medium text-text">No model findings for this unit</p>
              <p className="mt-1 text-xs text-text-muted">All monitored assets are within normal bands.</p>
            </Card>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="register-heading" className="mt-8">
        <h3
          id="register-heading"
          className="heading-tight flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-subtle"
        >
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Asset register · sorted by health
        </h3>
        <Card className="mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-raised">
                  {["Asset", "Unit", "Health", "Vibration", "RUL", "Next PM", "SOP"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-subtle"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <AssetRow key={item.equipId} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section aria-labelledby="sop-heading" className="mt-8 pb-4">
        <h3
          id="sop-heading"
          className="heading-tight flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-subtle"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          SOP and manual library
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOP_LIBRARY.map((doc) => (
            <a
              key={doc.file}
              href={`/${doc.file}`}
              target="_blank"
              rel="noreferrer"
              className="group rounded-lg border border-border bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors duration-150 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text group-hover:text-accent">
                    {doc.title}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-text-muted">{doc.scope}</span>
                  <span className="mt-1 inline-block text-[10.5px] font-medium uppercase tracking-wide text-text-subtle">
                    Open PDF
                  </span>
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
