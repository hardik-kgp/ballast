import { FEED } from "./feed";

export type ChartId =
  | "generation_vs_schedule"
  | "vibration_trend"
  | "market_prices"
  | "exposure_monthly"
  | "exposure_by_unit";

export interface ChatArtifact {
  id: string;
  title: string;
  subtitle: string;
  chart: ChartId;
  footnote: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifact?: ChatArtifact;
  highlights?: string[];
}

const pred = FEED.prediction;
const spare = FEED.spare;
const vib = FEED.vibrationTrend;
const vibNow = vib[vib.length - 1]?.vibMmS ?? 0;
const vibBase = vib[0]?.vibMmS ?? 0;
const shortfallMwh = FEED.generation24h.reduce((s, p) => s + p.shortfallMw, 0);
const peakShortfall = Math.max(...FEED.generation24h.map((p) => p.shortfallMw));
const rtmPeak = FEED.marketPrices24h.reduce(
  (best, p) => (p.rtmRs !== null && p.rtmRs > best.price ? { price: p.rtmRs, time: p.time } : best),
  { price: 0, time: "" }
);
const worstUnit = [...FEED.exposureByUnit].sort((a, b) => b.netCr - a.netCr)[0];
const worstMonth = [...FEED.exposureMonthly].sort((a, b) => b.netCr - a.netCr)[0];

export const SUGGESTED_PROMPTS = [
  "What is my exposure if BFP-2A trips this week?",
  "How are we tracking against today's schedule?",
  "Where has the money leaked over the last 90 days?",
  "What is replacement power costing on the exchange?",
];

export const SEED_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "BFP-2A vibration is rising. What is my exposure if it trips this week?",
  },
  {
    id: "m2",
    role: "assistant",
    content:
      `Boiler Feed Pump 2A on ${pred?.unitId ?? "VSTPS-U3"} is at ${vibNow.toFixed(1)} mm/s, up from a ${vibBase.toFixed(1)} mm/s baseline over five weeks, and the model projects failure around ${pred?.predictedFailureDate ?? ""} (${pred?.confidencePct ?? 0}% confidence, about ${Math.round(pred?.rulDays ?? 0)} days of remaining life). The exposure is severe because the standby pump BFP-2C is out on an in-progress overhaul and the spare thrust bearing (${spare?.partId ?? ""}) is out of stock with a ${spare?.leadTimeDays ?? 0}-day lead; the incoming PO lands ${spare?.poEta ?? ""}, likely too late. If 2A trips, the unit derates below its NAPAF availability floor and the combined capacity-charge under-recovery, DSM penalty and exchange replacement power comes to \u20B9${pred?.rupeesAtRiskCr ?? 0} Cr.`,
    highlights: [
      `Vibration ${vibNow.toFixed(1)} mm/s, alert band ${FEED.meta.vibAlert}, danger ${FEED.meta.vibDanger} (ISO 10816)`,
      `Standby BFP-2C unavailable, spare bearing 0 on hand, ${spare?.leadTimeDays ?? 0}d lead`,
      `Projected exposure \u20B9${pred?.rupeesAtRiskCr ?? 0} Cr if the unit derates`,
      `Recommended: ${pred ? pred.recommendedAction.replace(/\s*\u2014\s*/g, ", ") : ""}`,
    ],
    artifact: {
      id: "art1",
      title: "BFP-2A vibration, five-week trend",
      subtitle: "Daily mean overall vibration vs ISO 10816 alert and danger bands",
      chart: "vibration_trend",
      footnote: "Source: condition_monitoring, equip VSTPS-U3-BFP-A, daily mean of hourly records",
    },
  },
  {
    id: "m3",
    role: "user",
    content: "How are we tracking against today's schedule?",
  },
  {
    id: "m4",
    role: "assistant",
    content:
      `Over the last 24 hours the fleet delivered within a few percent of schedule, but small gaps add up: cumulative shortfall was about ${shortfallMwh.toLocaleString("en-IN")} MWh with a peak gap of ${peakShortfall} MW. Every scheduled megawatt-hour not generated is settled through DSM or replaced on the exchange, which is why the deviation line, not the average, is what costs money.`,
    highlights: [
      `Cumulative shortfall ~${shortfallMwh.toLocaleString("en-IN")} MWh across 24h`,
      `Peak gap ${peakShortfall} MW against the dispatch schedule`,
      `Fleet currently at ${FEED.kpis.fleetLoadMw.toLocaleString("en-IN")} MW vs ${FEED.kpis.declaredMw.toLocaleString("en-IN")} MW declared`,
    ],
    artifact: {
      id: "art2",
      title: "Schedule vs actual generation, last 24 hours",
      subtitle: "Red bars mark blocks where actual fell short of schedule",
      chart: "generation_vs_schedule",
      footnote: "Source: schedule_blocks, 15-min dispatch blocks aggregated hourly across 5 units",
    },
  },
  {
    id: "m5",
    role: "user",
    content: "Where has the money leaked over the last 90 days?",
  },
  {
    id: "m6",
    role: "assistant",
    content:
      `Realized commercial exposure over the last 90 days is \u20B9${FEED.kpis.netExposure90dCr} Cr across the fleet. ${worstUnit?.unitId ?? ""} is the worst at \u20B9${worstUnit?.netCr ?? 0} Cr, and it is the only unit with meaningful capacity-charge under-recovery (\u20B9${worstUnit?.ccLostCr ?? 0} Cr), meaning its availability actually dipped below the NAPAF floor. Everywhere else the leak is DSM deviation penalties, which points at schedule discipline rather than availability.`,
    highlights: [
      `Fleet 90-day net exposure \u20B9${FEED.kpis.netExposure90dCr} Cr`,
      `${worstUnit?.unitId ?? ""} worst: \u20B9${worstUnit?.netCr ?? 0} Cr, incl. \u20B9${worstUnit?.ccLostCr ?? 0} Cr capacity charge lost`,
      "DSM penalties dominate on all other units",
    ],
    artifact: {
      id: "art3",
      title: "90-day commercial exposure by unit",
      subtitle: "Capacity charge lost vs DSM penalty vs RTM replacement",
      chart: "exposure_by_unit",
      footnote: "Source: commercial_exposure via v_exposure_90d (CERC ABT settlement model)",
    },
  },
];

export const FOLLOW_UP_RESPONSES: ChatMessage[] = [
  {
    id: "f1",
    role: "assistant",
    content:
      `Exchange prices over the last 24 hours peaked at \u20B9${rtmPeak.price.toFixed(2)}/kWh on the real-time market around ${rtmPeak.time}, versus roughly \u20B94/kWh off-peak. This spread is the core of the downtime problem: an unplanned trip forces you to buy replacement power in exactly the evening blocks where RTM is most expensive, while a planned outage taken in the early-morning trough costs a fraction.`,
    highlights: [
      `RTM peak \u20B9${rtmPeak.price.toFixed(2)}/kWh at ${rtmPeak.time}`,
      "Evening peak blocks are ~2x the overnight trough",
      "Unplanned trips buy at the worst hours; planned windows avoid them",
    ],
    artifact: {
      id: "f-art1",
      title: "IEX day-ahead vs real-time prices, last 24 hours",
      subtitle: "Replacement power for a trip is bought on these curves",
      chart: "market_prices",
      footnote: "Source: market_prices (DAM + RTM), hourly means of 15-min clearing prices",
    },
  },
  {
    id: "f2",
    role: "assistant",
    content:
      `Month by month, the leak is steady rather than spiky: ${worstMonth?.month ?? ""} was the worst at \u20B9${worstMonth?.netCr ?? 0} Cr, driven by ${worstMonth && worstMonth.ccLostCr > worstMonth.dsmCr ? "capacity-charge under-recovery" : "DSM deviation penalties"}. The pattern suggests two levers: protect availability on the at-risk units (that is the BFP-2A decision), and tighten schedule adherence to cut the recurring DSM bleed.`,
    highlights: [
      `Worst month ${worstMonth?.month ?? ""}: \u20B9${worstMonth?.netCr ?? 0} Cr net exposure`,
      "DSM penalties recur every month; CC losses spike with availability dips",
      "Both levers are operational, not tariff-driven",
    ],
    artifact: {
      id: "f-art2",
      title: "Monthly commercial exposure breakdown",
      subtitle: "Capacity charge lost, DSM penalty and RTM replacement by month",
      chart: "exposure_monthly",
      footnote: "Source: commercial_exposure, grouped by settlement month",
    },
  },
];
