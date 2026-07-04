import type { ChartId } from "@/data/chat";
import { ExposureByUnitChart } from "./ExposureByUnitChart";
import { ExposureMonthlyChart } from "./ExposureMonthlyChart";
import { GenerationChart } from "./GenerationChart";
import { MarketPriceChart } from "./MarketPriceChart";
import { VibrationChart } from "./VibrationChart";

export function ChartById({ id, height }: { id: ChartId; height?: number }) {
  switch (id) {
    case "generation_vs_schedule":
      return <GenerationChart height={height} />;
    case "vibration_trend":
      return <VibrationChart height={height} />;
    case "market_prices":
      return <MarketPriceChart height={height} />;
    case "exposure_monthly":
      return <ExposureMonthlyChart height={height} />;
    case "exposure_by_unit":
      return <ExposureByUnitChart height={height} />;
  }
}

export {
  ExposureByUnitChart,
  ExposureMonthlyChart,
  GenerationChart,
  MarketPriceChart,
  VibrationChart,
};
