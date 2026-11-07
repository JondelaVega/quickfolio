import { describe, expect, it } from 'vitest';
import { summarize } from '../domain/valuation';
import { at, lot, NOW, quote, sell } from '../test/fixtures';
import { buildExport, fingerprint } from './export';
import { parsePortfolio } from './schema';

describe('buildExport', () => {
   const fx = { USD: 1, EUR: 0.8 };
   const q = quote('A', 'USD', 50, { splits: [{ date: at('2026-06-01'), ratio: 2 }] });
   const trades = [
      lot({ symbol: 'A', quantity: 10, gross: 1000, fees: 10, eurUsd: 1.01, date: '2025-01-02' }),
      sell({ symbol: 'A', quantity: 4, gross: 480, eurUsd: 1.2, date: '2026-02-02' }),
   ];
   const portfolio = { trades, cash: { EUR: 100 } };
   const out = buildExport(
      portfolio,
      [],
      summarize(portfolio, { A: q }, fx, 'USD', NOW),
      summarize(portfolio, { A: q }, fx, 'EUR', NOW),
      { eurUsd: 1.25, fxDate: '2026-11-05' },
      new Date(NOW),
   );

   it('lists each trade with its value in both currencies, and each sale with its FIFO lots', () => {
      expect(out.trades[0]!.computed.total).toEqual({ local: 1010, USD: 1010, EUR: 1000 });
      const realized = out.trades[1]!.computed.realized!;

      // Units as on the sale date, before the later 2:1 split.
      expect(realized.lots).toEqual([
         { buyId: trades[0]!.id, buyDate: '2025-01-02', units: 4, costBasis: { local: 404, USD: 404, EUR: 400 } },
      ]);
      expect(realized.gain).toEqual({ local: 76, USD: 76, EUR: 0 });
      expect(out.report.totals.USD.realizedByYear).toEqual({ 2026: 76 });
      expect(out.report.holdings[0]).toMatchObject({
         symbol: 'A',
         shares: 12,
         value: { local: 600, USD: 600, EUR: 480 },
      });
   });

   it('imports back to the same ledger, ignoring computed figures', () => {
      expect(parsePortfolio(JSON.parse(JSON.stringify(out))).trades).toEqual(trades);
   });
});

describe('fingerprint', () => {
   const trade = lot({ symbol: 'A', quantity: 10, gross: 1000 });

   it('is the same for the same trades and cash, whatever order their fields are in', () => {
      const reordered = Object.fromEntries(Object.entries(trade).reverse()) as typeof trade;

      expect(fingerprint({ trades: [reordered], cash: { EUR: 5 } })).toBe(fingerprint({ trades: [trade], cash: { EUR: 5 } }));
      // A field that is absent and one that is undefined are the same once stored.
      const absent = { ...trade };

      delete absent.eurUsd;
      expect('eurUsd' in trade && !('eurUsd' in absent)).toBe(true);
      expect(fingerprint({ trades: [absent], cash: {} })).toBe(fingerprint({ trades: [trade], cash: {} }));
   });

   it('changes with any amount', () => {
      const base = fingerprint({ trades: [trade], cash: { EUR: 5 } });

      expect(fingerprint({ trades: [trade], cash: { EUR: 6 } })).not.toBe(base);
      expect(fingerprint({ trades: [{ ...trade, fees: 1 }], cash: { EUR: 5 } })).not.toBe(base);
   });
});
