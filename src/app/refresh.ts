import type { FxHistory, Intraday, Quote } from '../domain/market';
import { mergeRateHistory } from '../domain/money';
import { upsertSnapshot } from '../domain/snapshots';
import { DAY, today, tradeTime } from '../domain/time';
import { BASE, type Trade } from '../domain/types';
import { summarize } from '../domain/valuation';
import { message } from '../domain/errors';
import type { PriceProvider, RateProvider } from './ports';
import type { AppState, AppStore } from './state';

/** History is always fetched at least this far back, for trailing yield. */
const MIN_HISTORY_MS = 400 * DAY;

export interface RefreshDeps {
   prices: PriceProvider;
   rates: RateProvider;
}

/** Looks a symbol up for the trade form, with enough history for its yield. */
export async function lookupQuote(prices: PriceProvider, symbol: string): Promise<Quote> {
   return { ...(await prices.getQuote(symbol, Date.now() - MIN_HISTORY_MS)), symbol };
}

/**
 * Fetches prices, intraday bars and FX for everything in the ledger, then
 * records today's snapshot if the valuation is complete. A symbol whose fetch
 * fails keeps its cached quote and is reported in `status.failed`.
 *
 * Asked for while one is running, it queues a single further run instead:
 * a trade saved or a backup imported meanwhile may add symbols this run
 * isn't fetching. The returned promise settles after the queued run too.
 */
export async function refresh(store: AppStore, deps: RefreshDeps): Promise<void> {
   const { prices, rates } = deps;

   if (store.get().status.refreshing) {
      if (!store.get().status.queued) {
         store.update((s) => ({ ...s, status: { ...s.status, queued: true } }));
      }

      return;
   }

   store.update((s) => ({ ...s, status: { ...s.status, refreshing: true } }));
   const { portfolio, market, view } = store.get();

   // Dividend and split history must reach back to each symbol's first purchase.
   const since = new Map<string, number>();
   const floor = Date.now() - MIN_HISTORY_MS;

   for (const t of portfolio.trades) {
      since.set(t.symbol, Math.min(since.get(t.symbol) ?? floor, tradeTime(t.date)));
   }

   const symbols = [...since.keys()];
   // Intraday prices only matter for what is still held.
   const held = summarize(portfolio, market.quotes, market.fx, view.reporting)
      .holdings.filter((h) => h.shares > 0)
      .map((h) => h.symbol);
   const [results, intradayResults] = await Promise.all([
      Promise.allSettled(symbols.map((s) => prices.getQuote(s, since.get(s)!))),
      Promise.allSettled(held.map((s) => prices.getIntraday(s))),
   ]);
   // A failed symbol keeps its cached series; buildDay ignores one from another day.
   const intraday: Record<string, Intraday> = {};

   held.forEach((symbol, i) => {
      const r = intradayResults[i]!;
      const kept = r.status === 'fulfilled' ? r.value : market.intraday?.[symbol];

      if (kept) {
         intraday[symbol] = kept;
      }
   });

   const quotes: Record<string, Quote> = {};
   const failed = new Map<string, string>();

   results.forEach((r, i) => {
      const symbol = symbols[i]!;

      if (r.status === 'fulfilled') {
         quotes[symbol] = { ...r.value, symbol };
      } else {
         failed.set(symbol, message(r.reason));
         const cached = market.quotes[symbol];

         if (cached) {
            quotes[symbol] = cached;
         }
      }
   });

   // The ledger may have changed while prices were loading.
   const trades = () => store.get().portfolio.trades;
   // EUR is always fetched: every amount is shown in both reporting currencies.
   const currencies = [
      'EUR',
      ...trades().map((t) => t.currency),
      ...Object.values(quotes).map((q) => q.currency),
      ...Object.keys(store.get().portfolio.cash),
   ];
   let { fx, fxDate } = market;
   let fxError: string | undefined;

   try {
      ({ rates: fx, date: fxDate } = await rates.getUsdRates(currencies));
   } catch (e) {
      fxError = message(e);
   }

   const { fxHistory, error: fxHistoryError } = await refreshFxHistory(trades(), market.fxHistory ?? {}, rates);

   const again = store.get().status.queued === true;

   store.update((s) => {
      const portfolio = { ...s.portfolio, trades: backfillEurUsd(s.portfolio.trades, fxHistory) };
      const anySucceeded = symbols.length === 0 || failed.size < symbols.length;
      // A symbol traded since this run started keeps the quote looked up for its trade until the queued run fetches it.
      const traded = new Set(s.portfolio.trades.map((t) => t.symbol));
      const added = Object.entries(s.market.quotes).filter(([symbol]) => traded.has(symbol) && !symbols.includes(symbol));
      const market = {
         quotes: { ...Object.fromEntries(added), ...quotes },
         fx,
         fxDate,
         fxHistory,
         intraday,
         refreshedAt: anySucceeded ? Date.now() : s.market.refreshedAt,
      };

      return {
         ...s,
         portfolio: portfolio.trades === s.portfolio.trades ? s.portfolio : portfolio,
         market,
         snapshots: withSnapshot({ ...s, portfolio, market }, failed, fxError),
         status: { refreshing: false, failed, fxError, fxHistoryError },
      };
   });

   if (again) {
      await refresh(store, deps);
   }
}

/**
 * Only a complete, fresh valuation goes into history; a partial or stale
 * total would sit in the trend line permanently.
 */
function withSnapshot({ portfolio, market, snapshots }: AppState, failed: ReadonlyMap<string, string>, fxError?: string) {
   const usd = summarize(portfolio, market.quotes, market.fx, 'USD');
   const eur = summarize(portfolio, market.quotes, market.fx, 'EUR');
   const hasHoldings = portfolio.trades.length > 0 || Object.keys(portfolio.cash).length > 0;
   const heldFailed = usd.holdings.some((h) => h.shares > 0 && failed.has(h.symbol));

   return hasHoldings && !heldFailed && !fxError && usd.excluded === 0 && eur.excluded === 0
      ? upsertSnapshot(snapshots, today(), usd, eur)
      : snapshots;
}

/**
 * Extends the cached daily FX series back to the first purchase that needs
 * it, fetching only the days not already cached: each non-USD instrument
 * currency, plus EUR from the very first purchase for the EUR view.
 */
async function refreshFxHistory(trades: Trade[], cachedHistory: FxHistory, rates: RateProvider) {
   const fxHistory = { ...cachedHistory };
   const firstPurchase = new Map<string, string>();
   const need = (currency: string, date: string) => {
      const seen = firstPurchase.get(currency);

      if (!seen || date < seen) {
         firstPurchase.set(currency, date);
      }
   };

   for (const t of trades) {
      if (t.currency !== BASE) {
         need(t.currency, t.date);
      }

      need('EUR', t.date);
   }

   const results = await Promise.allSettled(
      [...firstPurchase].map(async ([currency, first]) => {
         const cached = fxHistory[currency] ?? [];
         const covered = cached.length > 0 && cached[0]!.date <= first;
         const from = covered ? cached[cached.length - 1]!.date : first;
         const fetched = await rates.getUsdRateHistory(currency, from, today());

         fxHistory[currency] = covered ? mergeRateHistory(cached, fetched) : fetched;
      }),
   );
   const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');

   return { fxHistory, error: failure ? message(failure.reason) : undefined };
}

/**
 * Gives trades saved before EUR/USD was recorded the reference rate for their
 * trade date, from the cached EUR history (no extra request). Needs history
 * that reaches the first purchase, which `refreshFxHistory` guarantees.
 * Returns `trades` itself when nothing needed filling.
 */
export function backfillEurUsd(trades: Trade[], fxHistory: FxHistory): Trade[] {
   const series = fxHistory.EUR ?? [];

   if (series.length === 0 || trades.every((t) => t.eurUsd !== undefined)) {
      return trades;
   }

   const rateOn = (date: string) => {
      let found: number | undefined;

      for (const r of series) {
         if (r.date > date) {
            break;
         }

         found = r.rate;
      }

      return found ? 1 / found : undefined;
   };

   return trades.map((t) => (t.eurUsd !== undefined ? t : { ...t, eurUsd: rateOn(t.date) }));
}
