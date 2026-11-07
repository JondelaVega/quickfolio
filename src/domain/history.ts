import { SHARE_EPSILON, heldAt, type Position } from './ledger';
import type { FxHistory, Quote } from './market';
import { tradeAmountUsd, usdPerBaseAt } from './trade';
import { BASE, type Reporting } from './types';

export interface HistoryPoint {
   /** `YYYY-MM-DD`. */
   date: string;
   /** Market value of the shares held that day, at that day's close and FX, in the reporting currency. */
   value: number;
   /** Cost basis of the shares held that day, at their trade-date rates, in the reporting currency. */
   cost: number;
   /** Set on the final point, which is valued at live prices rather than a close. */
   live?: boolean;
}

/**
 * Returns a lookup for the latest entry on or before a date. Queries must
 * come in non-decreasing date order: the cursor only moves forward, which
 * keeps a multi-year walk linear.
 */
function forwardFill<T extends { date: string }>(series: T[]): (date: string) => T | undefined {
   let i = -1;

   return (date) => {
      while (i + 1 < series.length && series[i + 1]!.date <= date) {
         i++;
      }

      return i >= 0 ? series[i] : undefined;
   };
}

/**
 * Rebuilds daily holdings value and cost basis in `base` from the first
 * purchase until yesterday, then appends `live` as today's point so the
 * series ends on the same figures as the summary. Shares leave the series on
 * the day they are sold, value and cost alike.
 *
 * Every position must have a quote whose currency matches it; pass only
 * holdings that are included in the summary. A day on which any held
 * position lacks a close or FX rate is skipped rather than shown undervalued.
 */
export function buildHistory(
   positions: Position[],
   quotes: Record<string, Quote>,
   fxHistory: FxHistory,
   today: string,
   live: { value: number; cost: number },
   base: Reporting = BASE,
   /** Today's USD per unit of `base`; values legacy trades that lack a trade-date EUR/USD. */
   usdPerBaseNow = 1,
): HistoryPoint[] {
   if (positions.length === 0) {
      return [];
   }

   const sorted = [...positions].sort((a, b) => a.buy.date.localeCompare(b.buy.date));
   const start = sorted[0]!.buy.date;
   const symbols = [...new Set(positions.map((p) => p.buy.symbol))];

   // A day is on the axis if any held exchange traded; the others carry their last close.
   const dates = new Set<string>();

   for (const s of symbols) {
      for (const c of quotes[s]!.closes) {
         if (c.date >= start && c.date < today) {
            dates.add(c.date);
         }
      }
   }

   const closeAt = new Map(symbols.map((s) => [s, forwardFill(quotes[s]!.closes)]));
   const rateAt = new Map(
      [...new Set([...positions.map((p) => p.buy.currency), base])]
         .filter((c) => c !== BASE)
         .map((c) => [c, forwardFill(fxHistory[c] ?? [])]),
   );
   const unitsPerUsdOn = (currency: string, date: string) => (currency === BASE ? 1 : rateAt.get(currency)!(date)?.rate);

   const points: HistoryPoint[] = [];

   for (const date of [...dates].sort()) {
      // Each lookup advances its cursor, so the base rate is read once per day, before the positions.
      const basePerUsd = unitsPerUsdOn(base, date);
      let value = 0;
      let cost = 0;
      let complete = basePerUsd !== undefined;

      for (const p of sorted) {
         if (!complete || p.buy.date > date) {
            break;
         }

         // Closes are split-adjusted, so they pair with today's split-adjusted share counts.
         const shares = heldAt(p, date);

         if (shares <= SHARE_EPSILON) {
            continue;
         }

         const close = closeAt.get(p.buy.symbol)!(date)?.close;
         const unitsPerUsd = unitsPerUsdOn(p.buy.currency, date);

         if (close === undefined || !unitsPerUsd) {
            complete = false;
            break;
         }

         value += ((shares * close) / unitsPerUsd) * basePerUsd!;
         cost += ((shares / p.shares) * tradeAmountUsd(p.buy)) / usdPerBaseAt(p.buy, base, usdPerBaseNow);
      }

      if (complete) {
         points.push({ date, value, cost });
      }
   }

   points.push({ date: today, ...live, live: true });

   return points;
}
