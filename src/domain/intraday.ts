import type { FxRates, Intraday } from './market';
import { localDay } from './time';
import type { Reporting } from './types';
import { tradedOn, type Holding } from './valuation';

export interface DayPoint {
   /** Epoch ms. */
   t: number;
   /** Holdings value in the reporting currency. */
   value: number;
   /** Set on the final point, which is the summary's live valuation. */
   live?: boolean;
}

/** Holdings value through one trading day, in the reporting currency. */
export interface DayCurve {
   /** Local date the curve covers, `YYYY-MM-DD`. */
   day: string;
   /** Earliest open among the exchanges that traded that day, epoch ms. */
   start: number;
   /** Latest close among them; can be after the last point while markets are open. */
   end: number;
   /** Holdings value at the previous close: where the day's change is measured from. */
   previousValue: number;
   points: DayPoint[];
}

/**
 * Rebuilds the day's holdings value from intraday prices at today's FX rate
 * (rates are daily). Holdings that traded on `day` follow their bars from
 * their previous close; the rest stay at their last price, so they shift the
 * level but not the change. Share counts are today's throughout.
 *
 * - Parameters:
 *   - holdings: Priced holdings without issues, as in the summary.
 *   - day: The summary's `day`.
 *   - live: The summary's invested value, so the curve ends on it.
 * - Returns: Undefined when no holding that traded on `day` has intraday prices.
 */
export function buildDay(
   holdings: Holding[],
   intraday: Record<string, Intraday>,
   fx: FxRates,
   base: Reporting,
   day: string | undefined,
   now: number,
   live: number,
): DayCurve | undefined {
   if (day === undefined) {
      return undefined;
   }

   const legs = holdings
      .filter((h) => h.shares > 0 && h.quote && fx[h.currency] && fx[base])
      .map((h) => {
         const bars = intraday[h.symbol];
         const previousClose = h.quote!.previousClose ?? bars?.previousClose;
         // A cached series from an earlier day (today's fetch failed) must not stretch the axis.
         const moving =
            tradedOn(h, day) &&
            bars !== undefined &&
            bars.bars.length > 0 &&
            localDay(bars.session.start) === day &&
            previousClose !== undefined;

         return {
            // Shares × instrument→reporting rate: price in, value out.
            weight: h.shares * (fx[base]! / fx[h.currency]!),
            last: h.quote!.price,
            ...(moving ? { bars: bars, previousClose: previousClose } : {}),
         };
      });
   const moving = legs.filter((l) => l.bars);

   if (moving.length === 0) {
      return undefined;
   }

   const start = Math.min(...moving.map((l) => l.bars!.session.start));
   const end = Math.max(...moving.map((l) => l.bars!.session.end));
   const liveAt = Math.min(now, end);
   const still = legs.filter((l) => !l.bars).reduce((s, l) => s + l.weight * l.last, 0);
   const previousValue = still + moving.reduce((s, l) => s + l.weight * l.previousClose!, 0);

   // Every bar time of every exchange; between its own bars a leg holds its latest price.
   const times = [...new Set(moving.flatMap((l) => l.bars!.bars.map((b) => b.t)))]
      .filter((t) => t >= start && t < liveAt)
      .sort((a, b) => a - b);
   const cursors = moving.map(() => -1);
   const points: DayPoint[] = [{ t: start, value: previousValue }];

   for (const t of times) {
      let value = still;

      moving.forEach((l, i) => {
         const bars = l.bars!.bars;

         while (cursors[i]! + 1 < bars.length && bars[cursors[i]! + 1]!.t <= t) {
            cursors[i]!++;
         }

         value += l.weight * (cursors[i]! >= 0 ? bars[cursors[i]!]!.price : l.previousClose!);
      });

      if (t > start) {
         points.push({ t, value });
      } else {
         points[0] = { t, value };
      }
   }

   points.push({ t: liveAt, value: live, live: true });

   return { day, start, end, previousValue, points };
}
