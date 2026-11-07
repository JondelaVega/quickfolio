import { describe, expect, it } from 'vitest';
import { at, lot, NOW, quote, sell } from '../test/fixtures';
import { convert } from './money';
import { summarize } from './valuation';

describe('summarize', () => {
   const fx = { USD: 1, EUR: 0.8 }; // 1 EUR = 1.25 USD today

   it('splits USD P/L into price and FX effects using the purchase rate', () => {
      const s = summarize(
         {
            trades: [lot({ symbol: 'X', currency: 'EUR', quantity: 10, gross: 990, fees: 10, fxRate: 1.1 })],
            cash: {},
         },
         { X: quote('X', 'EUR', 110) },
         fx,
         'USD',
         NOW,
      );
      const h = s.holdings[0]!;

      expect(h.basis).toBeCloseTo(1100);
      expect(h.value).toBeCloseTo(1375);
      expect(h.pricePl).toBeCloseTo(100 * 1.1);
      expect(h.fxPl).toBeCloseTo(1100 * (1.25 - 1.1));
      expect(h.pl).toBeCloseTo(275);
      expect(h.pricePl! + h.fxPl!).toBeCloseTo(h.pl!);
      expect(s.fees).toBeCloseTo(11);
   });

   it('values fees in their own currency at the trade-date rate', () => {
      const s = summarize(
         {
            // USD stock with a EUR fee charged when 1 EUR was 1.10 USD.
            trades: [lot({ symbol: 'U', quantity: 10, gross: 1000, fees: 10, feeCurrency: 'EUR', feeFxRate: 1.1 })],
            cash: {},
         },
         { U: quote('U', 'USD', 100) },
         fx,
         'USD',
         NOW,
      );
      const h = s.holdings[0]!;

      expect(h.basis).toBeCloseTo(1011);
      expect(h.basisLocal).toBeCloseTo(1011);
      expect(s.fees).toBeCloseTo(11);
      expect(h.pl).toBeCloseTo(-11);
      expect(h.avgCostLocal).toBeCloseTo(101.1);
   });

   it('crosses a fee into a non-USD instrument currency through USD', () => {
      const s = summarize(
         {
            // EUR stock at 1.25 USD/EUR with a 12.5 USD fee: 10 EUR.
            trades: [
               lot({
                  symbol: 'E',
                  currency: 'EUR',
                  quantity: 1,
                  gross: 100,
                  fees: 12.5,
                  feeCurrency: 'USD',
                  feeFxRate: 1,
                  fxRate: 1.25,
               }),
            ],
            cash: {},
         },
         { E: quote('E', 'EUR', 110) },
         fx,
         'USD',
         NOW,
      );

      expect(s.holdings[0]!.basisLocal).toBeCloseTo(110);
      expect(s.holdings[0]!.basis).toBeCloseTo(137.5);
      expect(s.holdings[0]!.pricePl).toBeCloseTo(0);
   });

   it('credits dividends with ex-dates after the trade date, per split-adjusted share', () => {
      const q = quote('D', 'USD', 100, {
         splits: [{ date: at('2026-03-02'), ratio: 2 }],
         dividends: [
            { date: at('2026-01-02'), amount: 1 }, // ex-date on the trade date: not earned
            { date: at('2026-04-01'), amount: 0.5 },
            { date: at('2026-07-01'), amount: 0.5 },
         ],
      });
      const s = summarize({ trades: [lot({ symbol: 'D', quantity: 10, gross: 1000 })], cash: {} }, { D: q }, fx, 'USD', NOW);
      const h = s.holdings[0]!;

      expect(h.shares).toBe(20);
      expect(h.dividendsLocal).toBeCloseTo(20);
      expect(h.yieldTtm).toBeCloseTo(2 / 100);
      expect(s.dividends).toBeCloseTo(20);
   });

   it('averages purchase price per current share, with and without fees', () => {
      const q = quote('S', 'EUR', 100, { splits: [{ date: at('2026-03-02'), ratio: 2 }] });
      const s = summarize(
         {
            trades: [
               // 10 shares before a 2:1 split (20 today), then 10 more after it.
               lot({ symbol: 'S', currency: 'EUR', quantity: 10, gross: 1000, fees: 10, fxRate: 1.1, date: '2026-01-02' }),
               lot({ symbol: 'S', currency: 'EUR', quantity: 10, gross: 500, fees: 5, fxRate: 1.2, date: '2026-06-01' }),
            ],
            cash: {},
         },
         { S: q },
         fx,
         'USD',
         NOW,
      );
      const h = s.holdings[0]!;

      expect(h.shares).toBe(30);
      expect(h.avgCostLocal).toBeCloseTo(1515 / 30);
      expect(h.avgPriceLocal).toBeCloseTo(1500 / 30);
      expect(h.avgCost).toBeCloseTo((1010 * 1.1 + 505 * 1.2) / 30);
   });

   it('annualizes only holdings held for at least a year', () => {
      const quotes = { A: quote('A', 'USD', 121) };
      const young = summarize(
         { trades: [lot({ symbol: 'A', quantity: 1, gross: 100, date: '2026-06-01' })], cash: {} },
         quotes,
         fx,
         'USD',
         NOW,
      );

      expect(young.holdings[0]!.annualized).toBeUndefined();
      expect(young.annualized).toBeUndefined();

      const old = summarize(
         { trades: [lot({ symbol: 'A', quantity: 1, gross: 100, date: '2024-11-05' })], cash: {} },
         quotes,
         fx,
         'USD',
         NOW,
      );

      expect(old.holdings[0]!.annualized).toBeCloseTo(0.1, 2);
      expect(old.annualized).toBeCloseTo(0.1, 2);
   });

   it('reports currency exposure and concentration across stocks and cash', () => {
      const s = summarize(
         {
            trades: [
               lot({ symbol: 'A', quantity: 1, gross: 400 }),
               lot({ symbol: 'B', quantity: 1, gross: 200 }),
               lot({ symbol: 'C', quantity: 1, gross: 100 }),
               lot({ symbol: 'E', currency: 'EUR', quantity: 1, gross: 160, fxRate: 1.25 }),
            ],
            cash: { EUR: 80 },
         },
         { A: quote('A', 'USD', 400), B: quote('B', 'USD', 200), C: quote('C', 'USD', 100), E: quote('E', 'EUR', 160) },
         fx,
         'USD',
         NOW,
      );

      expect(s.total).toBeCloseTo(1000);
      expect(s.exposure.map((e) => e.currency)).toEqual(['USD', 'EUR']);
      expect(s.exposure[0]!.weight).toBeCloseTo(0.7);
      expect(s.exposure[1]!.value).toBeCloseTo(300);
      expect(s.largest?.symbol).toBe('A');
      expect(s.largest?.weight).toBeCloseTo(0.4);
      expect(s.top3Weight).toBeCloseTo(0.8);
   });

   it('excludes unpriced or mismatched holdings from value and cost', () => {
      const s = summarize(
         {
            trades: [
               lot({ symbol: 'A', quantity: 1, gross: 50 }),
               lot({ symbol: 'B', quantity: 1, gross: 50 }),
               lot({ symbol: 'C', currency: 'SEK', quantity: 1, gross: 50, fxRate: 0.1 }),
            ],
            cash: { CHF: 10 },
         },
         { B: quote('B', 'EUR', 10), C: quote('C', 'SEK', 10) },
         fx,
         'USD',
         NOW,
      );

      expect(s.holdings.map((h) => h.issue)).toEqual(['No price yet', 'Quoted in EUR, but trades are in USD', 'No FX rate for SEK']);
      expect(s.excluded).toBe(4);
      expect(s.total).toBe(0);
      expect(s.costBasis).toBe(0);
   });
});

describe('reporting in EUR', () => {
   const fx = { USD: 1, EUR: 0.8 }; // today 1 EUR = 1.25 USD

   it('values a USD stock paid in EUR at the broker rate, so currency moves show as FX P/L', () => {
      const lots = [lot({ symbol: 'U', quantity: 10, gross: 1000, settledIn: 'EUR', eurUsd: 1.1 })];
      const quotes = { U: quote('U', 'USD', 100) };
      const eur = summarize({ trades: lots, cash: {} }, quotes, fx, 'EUR', NOW).holdings[0]!;

      expect(eur.basis).toBeCloseTo(1000 / 1.1);
      expect(eur.value).toBeCloseTo(800);
      expect(eur.pricePl).toBeCloseTo(0);
      expect(eur.fxPl).toBeCloseTo(800 - 1000 / 1.1);
      expect(eur.pricePl! + eur.fxPl!).toBeCloseTo(eur.pl!);
      // The same lot in USD has no currency effect at all.
      const usd = summarize({ trades: lots, cash: {} }, quotes, fx, 'USD', NOW).holdings[0]!;

      expect(usd.pl).toBeCloseTo(0);
   });

   it('reports a EUR stock and EUR cash without any FX effect', () => {
      const s = summarize(
         {
            trades: [lot({ symbol: 'E', currency: 'EUR', quantity: 10, gross: 500, fees: 5, fxRate: 1.05 })],
            cash: { EUR: 200 },
         },
         { E: quote('E', 'EUR', 55) },
         fx,
         'EUR',
         NOW,
      );

      expect(s.costBasis).toBeCloseTo(505);
      expect(s.invested).toBeCloseTo(550);
      expect(s.cashValue).toBeCloseTo(200);
      expect(s.fxPl).toBeCloseTo(0);
      expect(s.fees).toBeCloseTo(5);
   });

   it("falls back to today's rate for a legacy USD lot without EUR/USD", () => {
      const s = summarize(
         { trades: [lot({ symbol: 'L', quantity: 1, gross: 100 })], cash: {} },
         { L: quote('L', 'USD', 100) },
         fx,
         'EUR',
         NOW,
      );

      expect(s.costBasis).toBeCloseTo(80);
      expect(s.pl).toBeCloseTo(0);
   });

   it('converts through USD and reports missing rates', () => {
      expect(convert(100, 'EUR', 'USD', fx)).toBeCloseTo(125);
      expect(convert(125, 'USD', 'EUR', fx)).toBeCloseTo(100);
      expect(convert(1, 'GBP', 'USD', fx)).toBeUndefined();
   });
});

describe('sales', () => {
   const fx = { USD: 1, EUR: 0.8 }; // today 1 EUR = 1.25 USD

   it('realizes FIFO gains net of fees on both sides and keeps the rest as cost basis', () => {
      const trades = [
         lot({ symbol: 'A', quantity: 10, gross: 1000, fees: 10, date: '2024-01-02' }),
         lot({ symbol: 'A', quantity: 10, gross: 1500, fees: 10, date: '2025-01-02' }),
         sell({ symbol: 'A', quantity: 15, gross: 3000, fees: 15, date: '2026-03-02' }),
      ];
      const s = summarize({ trades, cash: {} }, { A: quote('A', 'USD', 200) }, fx, 'USD', NOW);
      const sale = s.sales[0]!;

      expect(sale.proceeds).toBeCloseTo(2985);
      expect(sale.basis).toBeCloseTo(1010 + 755);
      expect(sale.gain).toBeCloseTo(2985 - 1765);
      expect(s.realized).toBeCloseTo(1220);
      const h = s.holdings[0]!;

      expect(h.shares).toBe(5);
      expect(h.basis).toBeCloseTo(755);
      expect(h.fees).toBeCloseTo(5);
      expect(h.value).toBeCloseTo(1000);
      expect(s.pl).toBeCloseTo(245);
   });

   it('includes the currency effect in EUR, at the sale-date rate', () => {
      // Bought for €1,000 at 1.10 USD/EUR; sold at the same USD price for €880 at 1.25.
      const trades = [
         lot({ symbol: 'U', quantity: 10, gross: 1100, settled: 1000, settledIn: 'EUR', eurUsd: 1.1, date: '2025-01-02' }),
         sell({
            symbol: 'U',
            quantity: 10,
            gross: 1100,
            settled: 880,
            settledIn: 'EUR',
            eurUsd: 1.25,
            date: '2026-03-02',
         }),
      ];
      const eur = summarize({ trades, cash: {} }, { U: quote('U', 'USD', 120) }, fx, 'EUR', NOW);

      expect(eur.sales[0]!.gain).toBeCloseTo(-120);
      expect(eur.sales[0]!.gainLocal).toBeCloseTo(0);
      expect(eur.holdings[0]!.shares).toBe(0);
      expect(eur.invested).toBe(0);
      expect(eur.excluded).toBe(0);
   });

   it('counts a sold-out holding without a quote as realized, not as excluded', () => {
      const trades = [
         lot({ symbol: 'Z', quantity: 1, gross: 100, date: '2025-01-02' }),
         sell({ symbol: 'Z', quantity: 1, gross: 150, date: '2025-06-02' }),
      ];
      const s = summarize({ trades, cash: {} }, {}, fx, 'USD', NOW);

      expect(s.excluded).toBe(0);
      expect(s.realized).toBeCloseTo(50);
      expect(s.holdings[0]!.issue).toBeUndefined();
   });

   it('flags a sale of more shares than were held and keeps the holding out of totals', () => {
      const trades = [lot({ symbol: 'A', quantity: 1, gross: 100 }), sell({ symbol: 'A', quantity: 2, gross: 300, date: '2026-02-02' })];
      const s = summarize({ trades, cash: {} }, { A: quote('A', 'USD', 100) }, fx, 'USD', NOW);

      expect(s.holdings[0]!.issue).toBe('The sale of 2026-02-02 sells 1 more shares than were held');
      expect(s.excluded).toBe(1);
      expect(s.realized).toBe(0);
   });

   it('stops dividends on sold shares, except for a sale on the ex-date', () => {
      const q = quote('D', 'USD', 100, {
         dividends: [
            { date: at('2026-04-01'), amount: 1 },
            { date: at('2026-07-01'), amount: 1 },
         ],
      });
      const trades = [
         lot({ symbol: 'D', quantity: 10, gross: 1000 }),
         sell({ symbol: 'D', quantity: 4, gross: 400, date: '2026-04-01' }),
         sell({ symbol: 'D', quantity: 6, gross: 600, date: '2026-06-01' }),
      ];
      const s = summarize({ trades, cash: {} }, { D: q }, fx, 'USD', NOW);

      expect(s.holdings[0]!.dividendsLocal).toBeCloseTo(10);
      expect(s.dividends).toBeCloseTo(10);
   });

   it('includes sales in the money-weighted return', () => {
      // -200, then +110 a year later and 121 of value a year after that: 10% a year.
      const trades = [
         lot({ symbol: 'A', quantity: 2, gross: 200, date: '2024-11-05' }),
         sell({ symbol: 'A', quantity: 1, gross: 110, date: '2025-11-05' }),
      ];
      const s = summarize({ trades, cash: {} }, { A: quote('A', 'USD', 121) }, fx, 'USD', NOW);

      expect(s.annualized).toBeCloseTo(0.1, 2);
   });
});
