import { describe, expect, it } from 'vitest';
import { createSave, loadMarket, loadPortfolio, type Saved } from './repositories';
import { KEYS } from './storage';

/** An in-memory stand-in for the browser's localStorage, refusing writes past `quota` characters. */
function useStorage(entries: Record<string, string>, quota = Infinity): Map<string, string> {
   const data = new Map(Object.entries(entries));
   const used = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
   const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
         const before = data.get(k);

         data.set(k, String(v));

         if (used() > quota) {
            if (before === undefined) {
               data.delete(k);
            } else {
               data.set(k, before);
            }

            throw new Error('QuotaExceededError');
         }
      },
      removeItem: (k: string) => void data.delete(k),
   };

   Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

   return data;
}

/** The EUR balance of the portfolio as written to storage. */
const storedCash = (data: Map<string, string>) => (JSON.parse(data.get(KEYS.portfolio)!) as { cash: Record<string, number> }).cash.EUR;

describe('loadPortfolio', () => {
   const copies = (data: Map<string, string>) =>
      (JSON.parse(data.get(KEYS.unreadablePortfolio)!) as { data: string }[]).map((c) => c.data);

   it('keeps a copy of a portfolio it cannot read before starting empty', () => {
      const raw = JSON.stringify({ trades: [{ symbol: 'constructor' }], cash: {} });
      const data = useStorage({ [KEYS.portfolio]: raw });
      const { portfolio, error, protect } = loadPortfolio();

      expect(portfolio).toEqual({ trades: [], cash: {} });
      expect(error).toContain('A copy is kept');
      expect(protect).toBeUndefined();
      expect(copies(data)).toEqual([raw]);
   });

   it('adds every new unreadable portfolio to the copies, keeping the earlier ones', () => {
      const data = useStorage({ [KEYS.portfolio]: 'second', [KEYS.unreadablePortfolio]: 'first' });

      loadPortfolio();
      expect(copies(data)).toEqual(['first', 'second']);
      loadPortfolio(); // the same data again is not copied twice
      expect(copies(data)).toEqual(['first', 'second']);
   });

   it('protects the original when no copy fits, rather than claiming one was kept', () => {
      const data = useStorage({ [KEYS.portfolio]: 'not json' }, KEYS.portfolio.length + 8 + 10);
      const { error, protect } = loadPortfolio();

      expect(protect).toBe(true);
      expect(error).toContain('too full to keep a copy');
      expect(data.has(KEYS.unreadablePortfolio)).toBe(false);
      // Saving then leaves the original alone, and says so.
      const save = createSave({ protectPortfolio: true });

      expect(
         save({ portfolio: { trades: [], cash: {} }, snapshots: [], market: { quotes: {}, fx: { USD: 1 } } }, { portfolio: true }),
      ).toContain('not being saved');
      expect(data.get(KEYS.portfolio)).toBe('not json');
   });

   it('reads a valid portfolio without a warning', () => {
      useStorage({ [KEYS.portfolio]: JSON.stringify({ trades: [], cash: { EUR: 10 } }) });
      expect(loadPortfolio()).toEqual({ portfolio: { trades: [], cash: { EUR: 10 } } });
   });
});

describe('loadMarket', () => {
   it('drops cached quotes that lack a valid symbol or currency', () => {
      const quote = (currency: string) => ({ currency, price: 1, dividends: [], splits: [], closes: [], marketTime: 0 });

      useStorage({
         [KEYS.market]: JSON.stringify({
            fx: { USD: 1 },
            quotes: { AAA: quote('USD'), BBB: quote('<i>'), constructor: quote('USD') },
         }),
      });
      expect(Object.keys(loadMarket().quotes)).toEqual(['AAA']);
   });

   it('drops a cached quote whose name is not text, and an FX date that is not a date', () => {
      const quote = (name: unknown) => ({
         currency: 'USD',
         name,
         price: 1,
         dividends: [],
         splits: [],
         closes: [],
         marketTime: 0,
      });

      useStorage({
         [KEYS.market]: JSON.stringify({
            fx: { USD: 1 },
            fxDate: { x: 1 },
            quotes: { AAA: quote('Apple'), BBB: quote({}) },
         }),
      });
      const m = loadMarket();

      expect(Object.keys(m.quotes)).toEqual(['AAA']);
      expect(m.fxDate).toBeUndefined();
   });
});

describe('createSave', () => {
   const closes = Array.from({ length: 400 }, (_, i) => ({ date: `2025-01-${i}`, close: i }));
   const market = {
      quotes: { AAA: { symbol: 'AAA', currency: 'USD', price: 1, marketTime: 0, dividends: [], splits: [], closes } },
      fx: { USD: 1 },
   };
   const data = (cash: number): Saved => ({ portfolio: { trades: [], cash: { EUR: cash } }, snapshots: [], market });

   it('makes room for the portfolio by giving up the price history', () => {
      // Storage holds the full cache with almost nothing to spare.
      const cached = JSON.stringify(market);
      const store = useStorage({ [KEYS.market]: cached }, KEYS.market.length + cached.length + 40);

      expect(createSave()(data(5), { portfolio: true })).toBeUndefined();
      expect(storedCash(store)).toBe(5);
      const cache = JSON.parse(store.get(KEYS.market)!) as { quotes: Record<string, { closes: unknown[] }> };

      expect(cache.quotes.AAA!.closes).toEqual([]);
   });

   it('never throws over the market cache alone', () => {
      const store = useStorage({}, 10);

      expect(createSave()(data(1), { market: true })).toBeUndefined();
      expect(store.has(KEYS.market)).toBe(false);
   });

   it('keeps retrying what it could not save, and clears the error only once it is stored', () => {
      const tiny: Saved = {
         portfolio: { trades: [], cash: { EUR: 1 } },
         snapshots: [],
         market: { quotes: {}, fx: { USD: 1 } },
      };
      const store = useStorage({ filler: 'x'.repeat(100) }, 120);
      const save = createSave();

      expect(save(tiny, { portfolio: true })).toContain('trades and cash could not be saved');
      // A later save of the market alone must not hide that the trades are still unsaved.
      expect(save(tiny, { market: true })).toContain('trades and cash could not be saved');
      store.delete('filler');
      expect(save(tiny, { market: true })).toBeUndefined();
      expect(storedCash(store)).toBe(1);
   });
});
