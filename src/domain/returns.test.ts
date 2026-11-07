import { describe, expect, it } from 'vitest';
import { xirr } from './returns';
import { DAY, tradeTime } from './time';

describe('xirr', () => {
   it('finds the annual rate of a simple one-year investment', () => {
      const t0 = tradeTime('2025-01-01');

      expect(
         xirr([
            { t: t0, amount: -100 },
            { t: t0 + 365.25 * DAY, amount: 110 },
         ]),
      ).toBeCloseTo(0.1, 6);
   });

   it('returns undefined without both an outflow and an inflow', () => {
      expect(xirr([{ t: 0, amount: -100 }])).toBeUndefined();
   });
});
