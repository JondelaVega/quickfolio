import type { FxRates, RateSeries } from './market';

/** Converts between currencies at the given rates (units per USD); undefined if a rate is missing. */
export function convert(amount: number, from: string, to: string, fx: FxRates): number | undefined {
   if (from === to) {
      return amount;
   }

   const a = fx[from];
   const b = fx[to];

   return a && b ? (amount / a) * b : undefined;
}

/**
 * Adds freshly fetched rates to a cached series; fetched dates replace cached
 * ones so a corrected publication wins.
 */
export function mergeRateHistory(cached: RateSeries, fetched: RateSeries): RateSeries {
   const byDate = new Map(cached.map((r) => [r.date, r.rate]));

   for (const r of fetched) {
      byDate.set(r.date, r.rate);
   }

   return [...byDate].map(([date, rate]) => ({ date, rate })).sort((a, b) => a.date.localeCompare(b.date));
}
