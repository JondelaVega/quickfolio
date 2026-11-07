import { describe, expect, it } from 'vitest';
import { at, lot, quote, sell } from '../test/fixtures';
import { matchFifo } from './ledger';
import { currentShares } from './trade';
import type { Trade } from './types';

describe('matchFifo', () => {
   const asEntered = (t: Trade) => t.quantity;

   it('sells the oldest shares first, across purchases', () => {
      const a = lot({ symbol: 'A', quantity: 10, gross: 100, date: '2024-01-02' });
      const b = lot({ symbol: 'A', quantity: 10, gross: 200, date: '2025-01-02' });
      const s = sell({ symbol: 'A', quantity: 15, gross: 300, date: '2026-01-02' });
      const { positions, matches } = matchFifo([s, b, a], asEntered);

      expect(matches[0]!.lots.map((l) => [l.buy.date, l.shares])).toEqual([
         ['2024-01-02', 10],
         ['2025-01-02', 5],
      ]);
      expect(positions.map((p) => p.remaining)).toEqual([0, 5]);
      expect(matches[0]!.unmatched).toBe(0);
   });

   it('lets a same-day purchase cover a sale, and reports shares sold beyond those held', () => {
      const { matches } = matchFifo(
         [sell({ symbol: 'A', quantity: 3, gross: 30 }), lot({ symbol: 'A', quantity: 2, gross: 20 })],
         asEntered,
      );

      expect(matches[0]!.unmatched).toBe(1);
   });

   it('compares shares across a split', () => {
      const q = quote('A', 'USD', 1, { splits: [{ date: at('2025-06-02'), ratio: 4 }] });
      const { positions, matches } = matchFifo(
         [
            lot({ symbol: 'A', quantity: 10, gross: 1000, date: '2025-01-02' }),
            sell({ symbol: 'A', quantity: 40, gross: 1200, date: '2025-07-01' }),
         ],
         (t) => currentShares(t, q),
      );

      expect(matches[0]!.unmatched).toBe(0);
      expect(positions[0]!.remaining).toBe(0);
   });
});
