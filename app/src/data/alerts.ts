import { FEED, type FeedAlert } from "./feed";

export type AlertSeverity = "critical" | "high" | "normal" | "low";
export type AlertKind = "predictive" | "threshold" | "market" | "fuel" | "emission";

export interface PlantAlert {
  id: string;
  title: string;
  description: string;
  unit: string;
  severity: AlertSeverity;
  kind: AlertKind;
  raisedMinutesAgo: number;
  impactCr?: number;
  recommendation?: string;
  equipName?: string;
}

const SEVERITY_FROM_FEED: Record<FeedAlert["severity"], AlertSeverity> = {
  critical: "critical",
  warning: "high",
  info: "normal",
};

const KIND_FROM_CATEGORY: Record<FeedAlert["category"], AlertKind> = {
  condition: "predictive",
  process: "threshold",
  commercial: "market",
  fuel: "fuel",
  emission: "emission",
};

export const ALERTS: PlantAlert[] = FEED.alerts.map((a) => {
  const isGolden = a.equipName !== null && FEED.prediction?.equipName === a.equipName;
  return {
    id: String(a.alertId),
    title: a.title,
    description: a.message,
    unit: a.unitId ?? "Fleet",
    severity: SEVERITY_FROM_FEED[a.severity],
    kind: KIND_FROM_CATEGORY[a.category],
    raisedMinutesAgo: a.minutesAgo,
    impactCr: a.rupeesAtRiskCr ?? undefined,
    recommendation: isGolden
      ? FEED.prediction?.recommendedAction.replace(/\s*\u2014\s*/g, ", ")
      : undefined,
    equipName: a.equipName ?? undefined,
  };
});
