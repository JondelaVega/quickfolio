import type { HistoryPoint } from '../../../domain/history';
import type { DayCurve } from '../../../domain/intraday';
import { RANGES } from '../../../domain/ranges';
import { DAY } from '../../../domain/time';
import { clock, dayMs, onCost, shortDate, weekdayDate } from './labels';
import type { PlotSpec, Point, TrendOptions } from './types';

/** Daily closes for the selected range, ending on today's live point. */
export function historySpec(all: HistoryPoint[], opts: TrendOptions): PlotSpec | undefined {
   const days = RANGES.find((r) => r.key === opts.range)!.days;
   const last = all[all.length - 1];
   const from = last && Number.isFinite(days) ? dayMs(last.date) - days * DAY : -Infinity;
   const kept = all.filter((p) => dayMs(p.date) >= from);

   if (kept.length < 2) {
      return undefined;
   }

   const dates = new Map<number, string>();
   const points = kept.map((p) => {
      const t = dayMs(p.date);

      dates.set(t, p.date);

      return { t, value: p.value, ref: p.cost, live: p.live };
   });
   const name = (p: Point) => shortDate(dates.get(p.t)!);
   const first = points[0]!;
   const end = points[points.length - 1]!;
   const month = (p: Point) => dates.get(p.t)!.slice(0, 7);

   return {
      points,
      t0: first.t,
      t1: end.t,
      ref: { cls: 'trend-cost', label: 'Cost basis', endLabel: 'Cost', flat: false },
      xLabels: [
         { t: first.t, text: name(first), anchor: 'start' },
         { t: end.t, text: 'Now', anchor: 'end' },
      ],
      pointName: (p) => (p.live ? 'Now (live prices)' : name(p)),
      tipRows: opts.hideAmounts
         ? [{ cls: 'trend-value', label: 'Return on cost', get: (p) => opts.pct(onCost(p)) }]
         : [
              { cls: 'trend-value', label: 'Holdings value', get: (p) => opts.money(p.value) },
              { cls: 'trend-cost', label: 'Cost basis', get: (p) => opts.money(p.ref) },
              { cls: '', label: 'Unrealized P/L', get: (p) => opts.signedMoney(p.value - p.ref) },
           ],
      aria:
         `Holdings value from ${opts.money(first.value)} on ${name(first)} to ${opts.money(end.value)} now, ` +
         `against a cost basis of ${opts.money(end.ref)}.`,
      keyStep: 'days',
      table: {
         summary: 'Show as table (month-end)',
         head: opts.hideAmounts ? ['Date', 'Return on cost'] : ['Date', 'Holdings value', 'Cost basis', 'Unrealized P/L'],
         keep: (p, next) => !!p.live || !next || month(next) !== month(p),
         cells: (p) => {
            const date = p.live ? 'Now' : dates.get(p.t)!;

            return opts.hideAmounts
               ? [date, opts.pct(onCost(p))]
               : [date, opts.money(p.value), opts.money(p.ref), opts.signedMoney(p.value - p.ref)];
         },
      },
   };
}

/** One session-day from the earliest open to the latest close, against the previous close. */
export function daySpec(day: DayCurve | undefined, opts: TrendOptions): PlotSpec | undefined {
   if (!day || day.points.length < 2) {
      return undefined;
   }

   const points = day.points.map((p) => ({ t: p.t, value: p.value, ref: day.previousValue, live: p.live }));
   const end = points[points.length - 1]!;
   const vsClose = (p: Point) =>
      opts.hideAmounts ? opts.pct(onCost(p)) : `${opts.signedMoney(p.value - p.ref)} · ${opts.pct(onCost(p))}`;
   const hour = (p: Point) => new Date(p.t).getHours();

   return {
      points,
      t0: day.start,
      t1: day.end,
      ref: { cls: 'trend-ref', label: 'Previous close', endLabel: 'Prev close', flat: true },
      // Open and close at the ends, whole hours between; placed once the width is known.
      xLabels: [
         { t: day.start, text: clock(day.start), anchor: 'start' },
         { t: day.end, text: clock(day.end), anchor: 'end' },
      ],
      pointName: (p) => (p.live ? `${clock(p.t)} (live prices)` : clock(p.t)),
      tipRows: [
         ...(opts.hideAmounts ? [] : [{ cls: 'trend-value', label: 'Holdings value', get: (p: Point) => opts.money(p.value) }]),
         { cls: opts.hideAmounts ? 'trend-value' : '', label: 'vs previous close', get: vsClose },
      ],
      aria:
         `Holdings value through ${weekdayDate(day.day)} from ${clock(day.start)}, ${opts.money(end.value)} at ${clock(end.t)}, ` +
         `against ${opts.money(day.previousValue)} at the previous close. The session runs until ${clock(day.end)}.`,
      keyStep: 'price updates',
      table: {
         summary: 'Show as table (hourly)',
         head: opts.hideAmounts ? ['Time', 'vs previous close'] : ['Time', 'Holdings value', 'vs previous close'],
         keep: (p, next) => !!p.live || !next || hour(next) !== hour(p),
         cells: (p) => {
            const time = p.live ? `${clock(p.t)} (now)` : clock(p.t);

            return opts.hideAmounts ? [time, vsClose(p)] : [time, opts.money(p.value), vsClose(p)];
         },
      },
   };
}
