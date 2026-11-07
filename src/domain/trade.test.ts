import { describe, expect, it } from 'vitest';
import { at, lot, quote } from '../test/fixtures';
import { conversionCost, currentShares, deriveTrade, impliedEurUsd } from './trade';

describe('currentShares', () => {
   const q = quote('AAPL', 'USD', 300, { splits: [{ date: at('2020-08-31'), ratio: 4 }] });

   it('applies splits after the trade date', () => {
      expect(currentShares(lot({ symbol: 'AAPL', quantity: 10, gross: 1, date: '2019-06-03' }), q)).toBe(40);
   });

   it('does not apply a split effective on the trade date', () => {
      expect(currentShares(lot({ symbol: 'AAPL', quantity: 10, gross: 1, date: '2020-08-31' }), q)).toBe(10);
   });
});

describe('deriveTrade', () => {
   const ref = { eurUsd: 1.08, usdPerUnit: 1 };
   const base = { side: 'buy' as const, quantity: 10, unitPrice: 153, fees: 0, feeCurrency: 'USD' };

   it('derives EUR/USD from a USD stock paid in EUR', () => {
      const input = { ...base, currency: 'USD', settled: 1410, settledIn: 'EUR' };
      const d = deriveTrade(input, ref);

      expect(d.gross).toBe(1530);
      expect(d.fxRate).toBe(1);
      expect(d.eurUsd).toBeCloseTo(1530 / 1410, 6);
      expect(impliedEurUsd(input)).toBeCloseTo(1530 / 1410, 6);
   });

   it('derives EUR/USD from a EUR stock paid in USD', () => {
      const input = {
         ...base,
         currency: 'EUR',
         unitPrice: 10,
         settled: 108.5,
         settledIn: 'USD',
         fees: 2,
         feeCurrency: 'EUR',
      };
      const d = deriveTrade(input, { eurUsd: 1.08, usdPerUnit: 1.08 });

      expect(d.gross).toBe(100);
      expect(d.fxRate).toBeCloseTo(1.085);
      expect(d.eurUsd).toBeCloseTo(1.085);
      expect(d.feeFxRate).toBeCloseTo(1.085);
   });

   it('uses the total as cost and reference rates when paid in the same currency', () => {
      const input = { ...base, currency: 'USD', settled: 1529.5, settledIn: 'USD', fees: 3, feeCurrency: 'EUR' };
      const d = deriveTrade(input, ref);

      expect(d.gross).toBe(1529.5);
      expect(d.eurUsd).toBe(1.08);
      expect(d.feeFxRate).toBe(1.08);
      expect(impliedEurUsd(input)).toBeUndefined();
   });

   it('crosses a third currency through EUR when paid in EUR', () => {
      // GBP stock: 10 × £20 = £200, paid €230 → 1.15 EUR/GBP; at 1.08 USD/EUR that is 1.242 USD/GBP.
      const input = { ...base, currency: 'GBP', unitPrice: 20, settled: 230, settledIn: 'EUR' };
      const d = deriveTrade(input, { eurUsd: 1.08, usdPerUnit: 1.25 });

      expect(d.gross).toBe(200);
      expect(d.eurUsd).toBe(1.08);
      expect(d.fxRate).toBeCloseTo(1.15 * 1.08);
   });
});

describe('conversionCost', () => {
   const usdStock = { quantity: 10, unitPrice: 100, fees: 0, feeCurrency: 'USD', currency: 'USD', settledIn: 'EUR' };

   it('counts paying more EUR on a purchase, or receiving fewer on a sale, as a cost', () => {
      const buy = { ...usdStock, side: 'buy' as const, settled: 920 }; // 1.0870 vs ECB 1.10
      const sale = { ...usdStock, side: 'sell' as const, settled: 900 }; // 1.1111 vs ECB 1.10

      expect(conversionCost(buy, impliedEurUsd(buy)!, 1.1)).toBeCloseTo(1.1 / (1000 / 920) - 1);
      expect(conversionCost(sale, impliedEurUsd(sale)!, 1.1)).toBeCloseTo(1000 / 900 / 1.1 - 1);
      expect(conversionCost(sale, impliedEurUsd(sale)!, 1.1)).toBeGreaterThan(0);
   });
});
