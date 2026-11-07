import { describe, expect, it } from 'vitest';
import { lot, positionsOf, quote, sell } from '../test/fixtures';
import { buildHistory } from './history';

describe('buildHistory', () => {
   const closes = (pairs: [string, number][]) => pairs.map(([date, close]) => ({ date, close }));

   it('values held lots at each close and FX, forward-filling gaps, then ends on the live point', () => {
      const quotes = {
         // US closed on 2026-11-03; Helsinki traded.
         US: quote('US', 'USD', 0, {
            closes: closes([
               ['2026-11-02', 10],
               ['2026-11-04', 12],
               ['2026-11-05', 99],
            ]),
         }),
         HE: quote('HE', 'EUR', 0, {
            closes: closes([
               ['2026-11-02', 5],
               ['2026-11-03', 6],
               ['2026-11-04', 6],
            ]),
         }),
      };
      const lots = [
         lot({ symbol: 'US', quantity: 10, gross: 95, fees: 5, date: '2026-11-02' }),
         lot({ symbol: 'HE', currency: 'EUR', quantity: 100, gross: 600, fxRate: 1.2, date: '2026-11-03' }),
      ];
      const fxHistory = {
         EUR: [
            { date: '2026-11-01', rate: 0.8 },
            { date: '2026-11-04', rate: 1 },
         ],
      };
      const h = buildHistory(positionsOf(lots, quotes), quotes, fxHistory, '2026-11-05', { value: 1, cost: 2 });

      expect(h.map((p) => p.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
      expect(h[0]).toEqual({ date: '2026-11-02', value: 100, cost: 100 });
      // US carries its 11-02 close; EUR lot joins at 6 EUR / 0.8.
      expect(h[1]!.value).toBeCloseTo(100 + 750);
      expect(h[1]!.cost).toBeCloseTo(100 + 720);
      expect(h[2]!.value).toBeCloseTo(120 + 600);
      // Today's partial bar (99) is ignored in favour of the live figures.
      expect(h[3]).toEqual({ date: '2026-11-05', value: 1, cost: 2, live: true });
   });

   it('skips days where a held lot has no FX rate yet', () => {
      const quotes = {
         HE: quote('HE', 'EUR', 0, {
            closes: closes([
               ['2026-11-02', 5],
               ['2026-11-03', 6],
            ]),
         }),
      };
      const lots = [lot({ symbol: 'HE', currency: 'EUR', quantity: 1, gross: 5, fxRate: 1, date: '2026-11-02' })];
      const h = buildHistory(positionsOf(lots, quotes), quotes, { EUR: [{ date: '2026-11-03', rate: 1 }] }, '2026-11-05', {
         value: 0,
         cost: 0,
      });

      expect(h.map((p) => p.date)).toEqual(['2026-11-03', '2026-11-05']);
   });

   it('rebuilds history in EUR from daily EUR rates', () => {
      const q = quote('U', 'USD', 0, {
         closes: [
            { date: '2026-11-02', close: 10 },
            { date: '2026-11-03', close: 10 },
         ],
      });
      const lots = [lot({ symbol: 'U', quantity: 10, gross: 100, date: '2026-11-02', settledIn: 'EUR', eurUsd: 1 })];
      const fxHistory = {
         EUR: [
            { date: '2026-11-02', rate: 1 },
            { date: '2026-11-03', rate: 0.8 },
         ],
      };
      const h = buildHistory(positionsOf(lots, { U: q }), { U: q }, fxHistory, '2026-11-05', { value: 0, cost: 0 }, 'EUR', 1.25);

      expect(h.slice(0, 2)).toEqual([
         { date: '2026-11-02', value: 100, cost: 100 },
         { date: '2026-11-03', value: 80, cost: 100 },
      ]);
   });
   it('drops sold shares and their cost from the history on the sale date', () => {
      const q = quote('A', 'USD', 0, {
         closes: [
            { date: '2026-11-02', close: 10 },
            { date: '2026-11-03', close: 10 },
            { date: '2026-11-04', close: 12 },
         ],
      });
      const trades = [
         lot({ symbol: 'A', quantity: 10, gross: 100, date: '2026-11-02' }),
         sell({ symbol: 'A', quantity: 4, gross: 40, date: '2026-11-03' }),
      ];
      const h = buildHistory(positionsOf(trades, { A: q }), { A: q }, {}, '2026-11-05', { value: 0, cost: 0 });

      expect(h.slice(0, 3).map((p) => [p.date, +p.value.toFixed(6), +p.cost.toFixed(6)])).toEqual([
         ['2026-11-02', 100, 100],
         ['2026-11-03', 60, 60],
         ['2026-11-04', 72, 60],
      ]);
   });
});
