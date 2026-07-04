import { useEffect, useRef, useState } from "react";
import { FEED, type FeedUnit } from "@/data/feed";

const TICK_MS = 3000;
const TREND_POINTS = 8;

export interface LiveUnit extends FeedUnit {
  delta: number;
}

export interface LiveFeed {
  units: LiveUnit[];
  fleetLoadMw: number;
  secondsSinceUpdate: number;
}

function jitterLoad(unit: FeedUnit, current: number, rand: () => number) {
  if (unit.state !== "running" && unit.state !== "derated") return current;
  const step = unit.capacityMw * 0.004;
  const drift = (rand() * 2 - 1) * step;
  // Pull gently back toward the anchor so the walk never wanders off the real value.
  const pull = (unit.loadMw - current) * 0.15;
  const next = current + drift + pull;
  const floor = unit.loadMw * 0.96;
  const ceil = Math.min(unit.capacityMw, unit.loadMw * 1.04);
  return Math.min(ceil, Math.max(floor, next));
}

function jitterVibration(unit: FeedUnit, current: number, rand: () => number) {
  const anchor = unit.vibrationMmS;
  if (anchor <= 0) return current;
  const creep = unit.status === "at_risk" ? 0.004 : 0;
  const noise = (rand() * 2 - 1) * 0.04;
  const pull = (anchor - current) * 0.08;
  return Math.max(0, current + creep + noise + pull);
}

export function useLiveFeed(): LiveFeed {
  const [units, setUnits] = useState<LiveUnit[]>(() =>
    FEED.units.map((u) => ({ ...u, delta: 0 }))
  );
  const [lastTick, setLastTick] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const randRef = useRef(Math.random);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const rand = randRef.current;
      setUnits((prev) =>
        prev.map((unit) => {
          const anchor = FEED.units.find((u) => u.unitId === unit.unitId) ?? unit;
          const nextLoad = Math.round(jitterLoad(anchor, unit.loadMw, rand));
          const nextVib = jitterVibration(anchor, unit.vibrationMmS, rand);
          const trend = [...unit.loadTrend, nextLoad].slice(-TREND_POINTS);
          return {
            ...unit,
            loadMw: nextLoad,
            vibrationMmS: Math.round(nextVib * 10) / 10,
            loadTrend: trend,
            delta: nextLoad - unit.loadMw,
          };
        })
      );
      setLastTick(Date.now());
    }, TICK_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(clock);
    };
  }, []);

  return {
    units,
    fleetLoadMw: units.reduce((sum, u) => sum + u.loadMw, 0),
    secondsSinceUpdate: Math.max(0, Math.floor((now - lastTick) / 1000)),
  };
}
