import { useEffect, useState } from "react";

/**
 * Makes a chart series feel live by re-sampling its most recent point on an
 * interval. The mutation function receives the current last point and must
 * stay anchored to the real feed value so the walk never drifts from truth.
 */
export function useLiveSeries<T>(
  initial: T[],
  next: (last: T) => T,
  intervalMs = 3000
): T[] {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const id = window.setInterval(() => {
      setData((prev) => {
        if (prev.length === 0) return prev;
        const copy = prev.slice();
        copy[copy.length - 1] = next(copy[copy.length - 1]);
        return copy;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [next, intervalMs]);

  return data;
}
