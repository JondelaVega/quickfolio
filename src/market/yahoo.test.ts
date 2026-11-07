import { describe, expect, it } from 'vitest';
import { parseYahooChart, parseYahooIntraday } from './yahoo';

describe('parseYahooChart', () => {
   describe('quotes', () => {
      it('normalises pence-quoted prices and dividends to GBP', () => {
         const q = parseYahooChart(
            {
               chart: {
                  result: [
                     {
                        meta: {
                           symbol: 'VOD.L',
                           currency: 'GBp',
                           regularMarketPrice: 7250,
                           regularMarketChangePercent: 3.5714,
                        },
                        events: { dividends: { x: { date: 1_700_000_000, amount: 400 } } },
                     },
                  ],
               },
            },
            'VOD.L',
         );

         expect(q).toMatchObject({ currency: 'GBP', price: 72.5 });
         expect(q.previousClose).toBeCloseTo(70, 2);
         expect(q.dividends).toEqual([{ date: 1_700_000_000_000, amount: 4 }]);
      });

      it('reads split ratios', () => {
         const q = parseYahooChart(
            {
               chart: {
                  result: [
                     {
                        meta: { currency: 'USD', regularMarketPrice: 1 },
                        events: { splits: { x: { date: 1_598_880_600, numerator: 4, denominator: 1 } } },
                     },
                  ],
               },
            },
            'AAPL',
         );

         expect(q.splits).toEqual([{ date: 1_598_880_600_000, ratio: 4 }]);
      });

      it("surfaces Yahoo's error description", () => {
         expect(() =>
            parseYahooChart({ chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } }, 'ZZZ'),
         ).toThrow('No data found, symbol may be delisted');
      });
   });

   describe('closes', () => {
      it('dates bars in exchange-local time and skips missing closes', () => {
         const q = parseYahooChart(
            {
               chart: {
                  result: [
                     {
                        // 2026-11-04 22:30 UTC is 2026-11-05 09:30 in Tokyo (+9h).
                        meta: { currency: 'GBp', regularMarketPrice: 1, gmtoffset: 32400 },
                        timestamp: [1_793_831_400, 1_793_917_800],
                        indicators: { quote: [{ close: [250, null] }] },
                     },
                  ],
               },
            },
            'X',
         );

         expect(q.closes).toEqual([{ date: '2026-11-05', close: 2.5 }]);
      });
   });

   describe('currency', () => {
      const chart = (currency: string) => ({ chart: { result: [{ meta: { currency, regularMarketPrice: 1 } }] } });

      it('rejects a currency that is not a well-formed code', () => {
         expect(() => parseYahooChart(chart('<img src=x onerror=alert(1)>'), 'AAA')).toThrow('AAA is quoted in an unsupported currency');
         expect(() => parseYahooChart(chart('__proto__'), 'AAA')).toThrow('unsupported currency');
      });
   });

   describe('fields of the wrong type', () => {
      it('drops a name that is not text, so it can never break rendering', () => {
         const body = {
            chart: {
               result: [{ meta: { currency: 'USD', regularMarketPrice: 1, longName: {}, shortName: 7, fiftyTwoWeekHigh: 'x' } }],
            },
         };
         const q = parseYahooChart(body, 'AAA');

         expect(q.name).toBeUndefined();
         expect(q.high52).toBeUndefined();
      });
   });
});

describe('parseYahooIntraday', () => {
   it('parses the session, previous close and bars of an intraday chart', () => {
      const d = parseYahooIntraday(
         {
            chart: {
               result: [
                  {
                     meta: {
                        currency: 'GBp',
                        regularMarketPrice: 1,
                        chartPreviousClose: 700,
                        tradingPeriods: [[{ start: 1_793_952_000, end: 1_793_982_600 }]],
                     },
                     timestamp: [1_793_952_000, 1_793_952_300],
                     indicators: { quote: [{ close: [710, null] }] },
                  },
               ],
            },
         },
         'VOD.L',
      );

      expect(d).toEqual({
         session: { start: 1_793_952_000_000, end: 1_793_982_600_000 },
         previousClose: 7,
         bars: [{ t: 1_793_952_000_000, price: 7.1 }],
      });
   });
});
