import type { Summary } from './valuation';

/** End-of-day portfolio state, one per local calendar date. */
export interface Snapshot {
   /** Local calendar date, `YYYY-MM-DD`. */
   date: string;
   totalUsd: number;
   investedUsd: number;
   cashUsd: number;
   /** Cost basis of holdings that day; `investedUsd - costUsd` is unrealized P/L. */
   costUsd: number;
   /** Cost basis at trade-date EUR rates; with `eurUsd` gives the EUR view. Absent on older snapshots. */
   costEur?: number;
   /** USD per 1 EUR that day. Absent on older snapshots. */
   eurUsd?: number;
}

/**
 * Records today's state from a USD and a EUR valuation of the same data,
 * replacing any earlier snapshot from the same date so the last refresh of
 * the day wins.
 */
export function upsertSnapshot(snapshots: Snapshot[], date: string, usd: Summary, eur: Summary): Snapshot[] {
   const entry: Snapshot = {
      date,
      totalUsd: usd.total,
      investedUsd: usd.invested,
      cashUsd: usd.cashValue,
      costUsd: usd.costBasis,
      costEur: eur.costBasis,
      eurUsd: eur.total > 0 ? usd.total / eur.total : undefined,
   };

   return [...snapshots.filter((x) => x.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date));
}
