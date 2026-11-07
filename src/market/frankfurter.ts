// ECB reference rates from Frankfurter, reached through the /api/fx dev-server proxy.
import { isCurrencyCode, isIsoDate, isPositive } from '../domain/codes';
import type { FxRates, FxSnapshot, RateSeries } from '../domain/market';
import type { ReferenceRates } from '../domain/trade';
import { BASE } from '../domain/types';

type RateRow = { quote: string; rate: number; date: string };

async function fetchRates(query: string): Promise<RateRow[]> {
   const res = await fetch(`/api/fx/v2/rates?${query}`);
   const body: unknown = await res.json().catch(() => null);

   if (!res.ok || !Array.isArray(body)) {
      const message = (body as { message?: string } | null)?.message;

      throw new Error(message ?? `FX request failed (HTTP ${res.status})`);
   }

   // Rates are stored on trades and must load again: a row that isn't well formed is dropped.
   return (body as (Partial<RateRow> | null)[]).filter(
      (r): r is RateRow => isCurrencyCode(r?.quote) && isPositive(r.rate) && isIsoDate(r.date),
   );
}

/** Fetches today's daily reference rates from Frankfurter for the given currencies. */
export async function getUsdRates(currencies: Iterable<string>): Promise<FxSnapshot> {
   const wanted = [...new Set(currencies)].filter((c) => c !== BASE).sort();
   const rates: FxRates = { [BASE]: 1 };

   if (wanted.length === 0) {
      return { rates };
   }

   let date: string | undefined;

   for (const row of await fetchRates(`base=${BASE}&quotes=${wanted.map(encodeURIComponent).join(',')}`)) {
      rates[row.quote] = row.rate;
      date = row.date;
   }

   return { rates, date };
}

/**
 * Fetches daily rates for `currency` between two `YYYY-MM-DD` dates, inclusive.
 * Non-business days carry the previous business day's rate.
 */
export async function getUsdRateHistory(currency: string, from: string, to: string): Promise<RateSeries> {
   const rows = await fetchRates(`from=${from}&to=${to}&base=${BASE}&quotes=${encodeURIComponent(currency)}`);

   return rows.filter((r) => r.quote === currency).map((r) => ({ date: r.date, rate: r.rate }));
}

/** Returns USD per 1 unit of `currency` on `date` (YYYY-MM-DD), per the reference rate. */
async function getHistoricalUsdRate(currency: string, date: string): Promise<number> {
   if (currency === BASE) {
      return 1;
   }

   const row = (await fetchRates(`date=${date}&base=${encodeURIComponent(currency)}&quotes=${BASE}`))[0];

   if (!row) {
      throw new Error(`No ${currency}/${BASE} rate for ${date}`);
   }

   return row.rate;
}

/** Reference rates per instrument currency and date, kept so typing in the trade form doesn't refetch. */
const referenceCache = new Map<string, Promise<ReferenceRates>>();

/** EUR/USD and USD per unit of `currency` on `date`, per the reference rates. */
export function getReferenceRates(currency: string, date: string): Promise<ReferenceRates> {
   const key = `${currency}|${date}`;
   let rates = referenceCache.get(key);

   if (!rates) {
      rates = Promise.all([
         getHistoricalUsdRate('EUR', date),
         currency === BASE || currency === 'EUR' ? undefined : getHistoricalUsdRate(currency, date),
      ]).then(([eurUsd, own]) => ({ eurUsd, usdPerUnit: currency === BASE ? 1 : (own ?? eurUsd) }));
      rates.catch(() => referenceCache.delete(key)); // let a later attempt retry
      referenceCache.set(key, rates);
   }

   return rates;
}
