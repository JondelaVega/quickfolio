// What the app needs from the outside world. market/ provides implementations; tests provide fakes.
import type { FxSnapshot, Intraday, Quote, RateSeries } from '../domain/market';
import type { ReferenceRates } from '../domain/trade';

export interface PriceProvider {
   /**
    * Fetches the latest quote plus daily closes, dividends and splits from
    * `since` (epoch ms) onwards. Rejects with a human-readable message when
    * the symbol has no quote.
    */
   getQuote(symbol: string, since: number): Promise<Quote>;
   /** Fetches the most recent regular session's prices at a few minutes' resolution. */
   getIntraday(symbol: string): Promise<Intraday>;
}

export interface RateProvider {
   /** Today's units of each currency per USD, and the rates' publication date if any were fetched. */
   getUsdRates(currencies: Iterable<string>): Promise<FxSnapshot>;
   /** Daily units of `currency` per USD between two `YYYY-MM-DD` dates, inclusive. */
   getUsdRateHistory(currency: string, from: string, to: string): Promise<RateSeries>;
   /** EUR/USD and USD per unit of `currency` on a trade date. */
   getReferenceRates(currency: string, date: string): Promise<ReferenceRates>;
}
