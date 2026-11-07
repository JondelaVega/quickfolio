import { describe, expect, it } from 'vitest';
import { getReferenceRates, getUsdRates } from './frankfurter';

/** Answers every request with `rows`, as the rates endpoint would. */
const respondWith = (rows: unknown) =>
   Object.defineProperty(globalThis, 'fetch', {
      value: async () => ({ ok: true, status: 200, json: async () => rows }),
      configurable: true,
   });

describe('Frankfurter responses', () => {
   it('keeps only well-formed rows: a code, a positive number and a date', async () => {
      respondWith([
         { quote: 'EUR', rate: 0.86, date: '2026-11-06' },
         { quote: 'GBP', rate: '0.77', date: '2026-11-06' },
         { quote: 'SEK', rate: 0, date: '2026-11-06' },
         { quote: '<b>', rate: 1, date: '2026-11-06' },
         { quote: 'JPY', rate: 150, date: 'yesterday' },
      ]);
      expect(await getUsdRates(['EUR', 'GBP', 'SEK', 'JPY'])).toEqual({
         rates: { USD: 1, EUR: 0.86 },
         date: '2026-11-06',
      });
   });

   it('refuses a reference rate that is not a number, rather than storing it on a trade', async () => {
      respondWith([{ quote: 'USD', rate: '1.08', date: '2026-01-02' }]);
      await expect(getReferenceRates('EUR', '2026-01-02')).rejects.toThrow('No EUR/USD rate for 2026-01-02');
   });
});
