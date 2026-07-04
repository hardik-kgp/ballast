import feedJson from "./feed.json";

export type UnitStatus = "nominal" | "watch" | "at_risk" | "maintenance";

export interface FeedUnit {
  unitId: string;
  plantId: string;
  plantName: string;
  name: string;
  capacityMw: number;
  loadMw: number;
  state: string;
  status: UnitStatus;
  healthIndex: number;
  worstEquip: string | null;
  vibrationMmS: number;
  bearingTempC: number;
  riskPct: number;
  loadTrend: number[];
}

export interface GenerationPoint {
  time: string;
  scheduledMw: number;
  actualMw: number;
  shortfallMw: number;
}

export interface VibrationPoint {
  date: string;
  vibMmS: number;
}

export interface MarketPricePoint {
  time: string;
  damRs: number | null;
  rtmRs: number | null;
}

export interface ExposureMonth {
  month: string;
  ccLostCr: number;
  dsmCr: number;
  rtmCr: number;
  netCr: number;
}

export interface ExposureUnit {
  unitId: string;
  ccLostCr: number;
  dsmCr: number;
  rtmCr: number;
  netCr: number;
}

export interface FeedAlert {
  alertId: string;
  unitId: string | null;
  equipName: string | null;
  severity: "critical" | "warning" | "info";
  category: "condition" | "process" | "commercial" | "fuel" | "emission";
  title: string;
  message: string;
  rupeesAtRiskCr: number | null;
  minutesAgo: number;
}

export interface FeedPrediction {
  equipId: string;
  equipName: string;
  tagNo: string;
  unitId: string;
  failureMode: string;
  rulDays: number;
  confidencePct: number;
  rupeesAtRiskCr: number;
  recommendedAction: string;
  predictedFailureDate: string;
}

export interface FeedSpare {
  partId: string;
  name: string;
  onHandQty: number;
  leadTimeDays: number;
  poId: string | null;
  poEta: string | null;
  poStatus: string | null;
}

export interface Feed {
  meta: {
    operator: string;
    clockNowEpoch: number;
    plantCount: number;
    unitCount: number;
    installedMw: number;
    goldenEquip: string;
    goldenUnit: string;
    vibAlert: number;
    vibDanger: number;
  };
  kpis: {
    fleetLoadMw: number;
    declaredMw: number;
    availabilityPct: number;
    netExposure90dCr: number;
    minCoalDays: number | null;
  };
  units: FeedUnit[];
  generation24h: GenerationPoint[];
  vibrationTrend: VibrationPoint[];
  marketPrices24h: MarketPricePoint[];
  exposureMonthly: ExposureMonth[];
  exposureByUnit: ExposureUnit[];
  prediction: FeedPrediction | null;
  spare: FeedSpare | null;
  alerts: FeedAlert[];
}

export const FEED = feedJson as unknown as Feed;
