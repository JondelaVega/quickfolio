import { describe, expect, it } from 'vitest';
import { lot, quote } from '../test/fixtures';
import { buildDay } from './intraday';
import { tradeTime } from './time';
import { summarize } from './valuation';

describe('one-day performance', () => {
   const fx = { USD: 1, EUR: 0.8 }; // 1 EUR = 1.25 USD
   const hour = (h: number) => tradeTime('2026-11-05') + h * 3_600_000;
   // Helsinki has traded since 08:00 UTC; New York last traded yesterday and opens at 14:30.
   const quotes = {
      HE: quote('HE', 'EUR', 11, { previousClose: 10, marketTime: hour(11) }),
      US: quote('US', 'USD', 100, { previousClose: 90, marketTime: hour(-3) }),
   };
   const trades = [
      lot({ symbol: 'HE', currency: 'EUR', quantity: 10, gross: 100, fxRate: 1.25 }),
      lot({ symbol: 'US', quantity: 1, gross: 90 }),
   ];
   const intraday = {
      HE: {
         session: { start: hour(8), end: hour(16.5) },
         previousClose: 10,
         bars: [
            { t: hour(8), price: 10.5 },
            { t: hour(10), price: 11 },
         ],
      },
      US: { session: { start: hour(-9.5), end: hour(-3) }, previousClose: 80, bars: [{ t: hour(-5), price: 100 }] },
   };

   it("counts only holdings that traded on the latest trading day as today's change", () => {
      const s = summarize({ trades, cash: {} }, quotes, fx, 'USD', hour(11));

      expect(s.day).toBe('2026-11-05');
      expect(s.dayChange).toBeCloseTo(10 * 1 * 1.25); // US's +10 was yesterday's move
   });

   it("follows the day's bars from the previous close, holding the others at their last price", () => {
      const s = summarize({ trades, cash: {} }, quotes, fx, 'USD', hour(11));
      const day = buildDay(s.holdings, intraday, fx, 'USD', s.day, hour(11), s.invested)!;

      expect(day.start).toBe(hour(8));
      expect(day.end).toBe(hour(16.5));
      expect(day.previousValue).toBeCloseTo(100 * 1.25 + 100);
      expect(day.points.map((p) => [p.t, +p.value.toFixed(6)])).toEqual([
         [hour(8), 105 * 1.25 + 100],
         [hour(10), 110 * 1.25 + 100],
         [hour(11), 110 * 1.25 + 100],
      ]);
      expect(day.points.at(-1)!.live).toBe(true);
      expect(day.points.at(-1)!.value - day.previousValue).toBeCloseTo(s.dayChange);
   });

   it('has no curve without intraday prices for the day', () => {
      const s = summarize({ trades, cash: {} }, quotes, fx, 'USD', hour(11));

      expect(buildDay(s.holdings, { US: intraday.US }, fx, 'USD', s.day, hour(11), s.invested)).toBeUndefined();
   });
});
