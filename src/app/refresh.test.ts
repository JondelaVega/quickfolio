import { describe, expect, it } from 'vitest';
import type { Quote } from '../domain/market';
import { today } from '../domain/time';
import { lot, quote } from '../test/fixtures';
import type { PriceProvider, RateProvider } from './ports';
import { backfillEurUsd, refresh } from './refresh';
import { initialView, type AppState } from './state';
import { createStore } from './store';

const rates: RateProvider = {
   getUsdRates: async () => ({ rates: { USD: 1, EUR: 0.8 }, date: '2026-11-05' }),
   getUsdRateHistory: async (_currency, from) => [{ date: from, rate: 0.9 }],
   getReferenceRates: async () => ({ eurUsd: 1.25, usdPerUnit: 1 }),
};

/** Prices from a table; a symbol that isn't in it fails. */
const prices = (table: Record<string, Quote>): PriceProvider => ({
   getQuote: async (symbol) => {
      const q = table[symbol];

      if (!q) {
         throw new Error(`No data for ${symbol}`);
      }

      return q;
   },
   getIntraday: async () => ({ session: { start: 0, end: 1 }, bars: [] }),
});

const state = (trades = [lot({ symbol: 'AAA', quantity: 2, gross: 100, eurUsd: 1.1 })]): AppState => ({
   portfolio: { trades, cash: { EUR: 50 } },
   market: { quotes: { AAA: quote('AAA', 'USD', 60) }, fx: { USD: 1 } },
   snapshots: [],
   status: { refreshing: false, failed: new Map() },
   view: initialView({ hideAmounts: false }),
});

describe('refresh', () => {
   it('stores fresh prices and records a snapshot of a complete valuation', async () => {
      const store = createStore(state());

      await refresh(store, { prices: prices({ AAA: quote('AAA', 'USD', 70) }), rates });
      const s = store.get();

      expect(s.status).toEqual({ refreshing: false, failed: new Map(), fxError: undefined, fxHistoryError: undefined });
      expect(s.market.quotes.AAA!.price).toBe(70);
      expect(s.market.fx).toEqual({ USD: 1, EUR: 0.8 });
      // 2 × $70 invested plus €50 at 0.8 EUR per USD.
      expect(s.snapshots).toEqual([
         {
            date: today(),
            totalUsd: 202.5,
            investedUsd: 140,
            cashUsd: 62.5,
            costUsd: 100,
            costEur: 100 / 1.1,
            eurUsd: 1.25,
         },
      ]);
   });

   it('keeps the cached quote of a failed symbol and records no snapshot', async () => {
      const store = createStore(state());

      await refresh(store, { prices: prices({}), rates });
      const s = store.get();

      expect(s.status.failed.get('AAA')).toBe('No data for AAA');
      expect(s.market.quotes.AAA!.price).toBe(60);
      expect(s.market.refreshedAt).toBeUndefined();
      expect(s.snapshots).toEqual([]);
   });

   it('records no snapshot when FX fails', async () => {
      const store = createStore(state());
      const failing = { ...rates, getUsdRates: async () => Promise.reject(new Error('rate limit')) };

      await refresh(store, { prices: prices({ AAA: quote('AAA', 'USD', 70) }), rates: failing });
      expect(store.get().status.fxError).toBe('rate limit');
      expect(store.get().snapshots).toEqual([]);
   });

   it('runs once more when asked during a refresh, however often it was asked', async () => {
      const store = createStore(state());
      let fetches = 0;
      const counting = {
         ...prices({ AAA: quote('AAA', 'USD', 70) }),
         getQuote: async (symbol: string) => (fetches++, quote(symbol, 'USD', 70)),
      };
      const deps = { prices: counting, rates };

      await Promise.all([refresh(store, deps), refresh(store, deps), refresh(store, deps)]);
      expect(fetches).toBe(2);
      expect(store.get().status.refreshing).toBe(false);
      expect(store.get().status.queued).toBeUndefined();
   });

   it('keeps and then fetches a symbol whose trade was saved while it ran', async () => {
      const store = createStore(state());
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const fetched: string[] = [];
      const slow: PriceProvider = {
         getQuote: async (symbol) => {
            fetched.push(symbol);
            await gate;

            return quote(symbol, 'USD', symbol === 'NEW' ? 5 : 70);
         },
         getIntraday: async () => ({ session: { start: 0, end: 1 }, bars: [] }),
      };
      const running = refresh(store, { prices: slow, rates });

      // A trade for a new symbol is saved, with the quote the form looked up, and asks for a refresh.
      store.update((s) => ({
         ...s,
         portfolio: {
            ...s.portfolio,
            trades: [...s.portfolio.trades, lot({ symbol: 'NEW', quantity: 1, gross: 4, eurUsd: 1.1 })],
         },
         market: { ...s.market, quotes: { ...s.market.quotes, NEW: quote('NEW', 'USD', 4) } },
      }));
      void refresh(store, { prices: slow, rates });
      release();
      await running;
      expect(fetched).toEqual(['AAA', 'AAA', 'NEW']);
      expect(store.get().market.quotes.NEW!.price).toBe(5);
   });
});

describe('backfillEurUsd', () => {
   it('gives legacy trades the EUR/USD of their trade date, or the latest before it', () => {
      const legacy = lot({ symbol: 'AAA', quantity: 1, gross: 10, date: '2026-01-04' });
      const history = {
         EUR: [
            { date: '2026-01-02', rate: 0.8 },
            { date: '2026-01-05', rate: 0.9 },
         ],
      };

      expect(backfillEurUsd([legacy], history)[0]!.eurUsd).toBe(1.25);
   });

   it('returns the same ledger when nothing is missing', () => {
      const trades = [lot({ symbol: 'AAA', quantity: 1, gross: 10, eurUsd: 1.1 })];

      expect(backfillEurUsd(trades, { EUR: [{ date: '2026-01-02', rate: 0.8 }] })).toBe(trades);
   });
});
