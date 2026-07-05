import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileText,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/Card";
import { FEED } from "@/data/feed";

const pred = FEED.prediction;
const spare = FEED.spare;

// Controlled mitigation cuts the exposure to a small residual (the energy given up
// during a planned derate). Values are Ballast estimates, consistent with the feed.
const AT_RISK = pred?.rupeesAtRiskCr ?? 4.76;
const RESIDUAL = 0.36;
const AVOIDED = Math.max(0, AT_RISK - RESIDUAL);

interface DraftAction {
  icon: typeof PackageCheck;
  label: string;
  detail: string;
}

const DRAFT_ACTIONS: DraftAction[] = [
  {
    icon: PackageCheck,
    label: `Expedite ${spare?.poId ?? "PO"} — thrust bearing, air-freight`,
    detail: `ETA ${spare?.poEta ?? "TBD"} pulled ~3 days earlier to beat the failure window`,
  },
  {
    icon: ShieldCheck,
    label: `Controlled derate ${pred?.unitId ?? "VSTPS-U3"} to 68% MCR`,
    detail: "Holds PAF above the NAPAF floor through the repair window",
  },
  {
    icon: FileText,
    label: "Raise emergency WO to return standby BFP-2C",
    detail: "Escalates the in-progress overhaul to restore 2x50% redundancy",
  },
  {
    icon: ArrowRight,
    label: "Prepare revised capacity re-declaration to the RLDC",
    detail: "Keeps the schedule honest and avoids DSM surprise",
  },
];

export function MitigationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setApplied(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Respond to BFP-2A predicted failure"
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-fade-up relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)]">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="heading-tight text-[16px] font-semibold text-text">
                Respond to BFP-2A predicted failure
              </h2>
              <p className="mt-0.5 text-[12.5px] text-text-muted">
                {pred?.unitId ?? "VSTPS-U3"} · fails in ~{Math.round(pred?.rulDays ?? 5)} days ·{" "}
                <span className="font-medium text-rose-600">{"₹"}{AT_RISK} Cr at risk</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!applied ? (
            <>
              <p className="text-[13px] leading-relaxed text-text-muted">
                Ballast compared two responses over the repair window and quantified each in rupees.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {/* Do nothing */}
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-500" aria-hidden="true" />
                    <p className="text-[13px] font-semibold text-text">Run to failure</p>
                  </div>
                  <p className="tabular mt-2 text-[22px] font-semibold text-rose-600">
                    {"₹"}{AT_RISK} Cr
                  </p>
                  <p className="text-[11.5px] text-text-subtle">exposure if it trips unmanaged</p>
                  <ul className="mt-2.5 space-y-1 text-[12px] text-text-muted">
                    <li>Uncontrolled trip ~{pred?.predictedFailureDate ?? "Jul 09"}</li>
                    <li>PAF drops below NAPAF floor</li>
                    <li>CC under-recovery + DSM + RTM replacement</li>
                  </ul>
                </div>

                {/* Controlled mitigation */}
                <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 px-4 py-3.5 ring-1 ring-emerald-200">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <p className="text-[13px] font-semibold text-text">Controlled mitigation</p>
                    <Pill tone="success" className="ml-auto">Recommended</Pill>
                  </div>
                  <p className="tabular mt-2 text-[22px] font-semibold text-emerald-700">
                    {"₹"}{RESIDUAL.toFixed(2)} Cr
                  </p>
                  <p className="text-[11.5px] text-text-subtle">
                    residual after mitigation · {"₹"}{AVOIDED.toFixed(2)} Cr avoided
                  </p>
                  <ul className="mt-2.5 space-y-1 text-[12px] text-text-muted">
                    <li>Expedite the spare, controlled derate</li>
                    <li>Availability protected, no forced trip</li>
                    <li>Grounded in BFP O&amp;M Manual §5</li>
                  </ul>
                </div>
              </div>

              <p className="mt-4 text-[11.5px] font-medium uppercase tracking-wide text-text-subtle">
                Ballast will draft these actions
              </p>
              <ul className="mt-2 space-y-2">
                {DRAFT_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <li
                      key={a.label}
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-raised px-3.5 py-2.5"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-text">{a.label}</p>
                        <p className="text-[11.5px] text-text-subtle">{a.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="animate-fade-up">
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-text">
                    4 actions drafted · {"₹"}{AVOIDED.toFixed(2)} Cr exposure avoided
                  </p>
                  <p className="text-[12px] text-text-muted">
                    Queued for shift-in-charge approval. Exposure cut from {"₹"}{AT_RISK} Cr to{" "}
                    {"₹"}{RESIDUAL.toFixed(2)} Cr.
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {DRAFT_ACTIONS.map((a) => (
                  <li
                    key={a.label}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5"
                  >
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-[13px] text-text">{a.label}</p>
                    <Pill tone="neutral">Drafted · pending approval</Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface-raised px-5 py-3.5">
          <a
            href="/manuals/BFP-OM-Manual.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-muted hover:text-text"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            BFP O&amp;M Manual §5
          </a>
          {!applied ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => setApplied(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                )}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Apply controlled mitigation
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Done
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
