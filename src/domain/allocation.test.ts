import { describe, expect, it } from 'vitest';
import { lot } from '../test/fixtures';
import { allocationSlices } from './allocation';
import type { Holding } from './valuation';

describe('allocationSlices', () => {
   const holding = (symbol: string, value: number, date: string, issue?: string) =>
      ({ symbol, value, issue, open: [{ buy: lot({ symbol, quantity: 1, gross: 1, date }) }] }) as unknown as Holding;

   it('orders from the largest down and colors by first purchase, excluding unpriced holdings', () => {
      const s = allocationSlices([
         holding('A', 100, '2022-01-01'),
         holding('B', 300, '2024-01-01'),
         holding('X', 999, '2020-01-01', 'No price yet'),
         holding('C', 200, '2023-01-01'),
      ]);

      expect(s.map((x) => [x.symbol, x.slot])).toEqual([
         ['B', 2],
         ['C', 1],
         ['A', 0],
      ]);
      expect(s[0]!.share).toBeCloseTo(0.5);
   });

   it('keeps the five largest past six holdings and folds the rest into Other, last', () => {
      const hs = [10, 20, 30, 40, 50, 60, 70].map((v, i) => holding(`S${i}`, v, `2020-01-0${i + 1}`));
      const s = allocationSlices(hs);

      expect(s.map((x) => x.symbol)).toEqual(['S6', 'S5', 'S4', 'S3', 'S2', 'Other']);
      expect(s.map((x) => x.slot)).toEqual([4, 3, 2, 1, 0, undefined]);
      expect(s[5]).toMatchObject({ value: 30, folded: 2 });
   });
});
