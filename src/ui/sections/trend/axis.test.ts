import { describe, expect, it } from 'vitest';
import { niceTicks, spanTicks } from './axis';

describe('chart levels', () => {
   it('normally sit on round values', () => {
      expect(niceTicks(1200, 47120)).toEqual([0, 20000, 40000, 60000]);
   });

   it('while amounts are hidden, are evenly spread over the data, with no round values to measure against', () => {
      const ticks = spanTicks(1200, 47120);

      expect(ticks.length).toBe(4);
      expect(ticks[0]!).toBeCloseTo(1200 - 0.08 * 45920);
      expect(ticks[3]!).toBeCloseTo(47120 + 0.08 * 45920);
      const steps = ticks.slice(1).map((t, i) => t - ticks[i]!);

      expect(steps[0]!).toBeCloseTo(steps[2]!);
   });
});
