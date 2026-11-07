// Market data as the domain consumes it. Sources in market/ produce these shapes.

export interface Dividend {
   /** Ex-dividend date, epoch ms. */
   date: number;
   /** Per share as the instrument trades today, i.e. adjusted for later splits. */
   amount: number;
}

export interface Split {
   date: number;
   /** New shares per old share (4 for a 4:1 split). */
   ratio: number;
}

export interface Quote {
   symbol: string;
   name?: string;
   /** ISO currency code, already normalised from minor units (GBp → GBP). */
   currency: string;
   price: number;
   /** Absent when the source does not report today's change. */
   previousClose?: number;
   /** Epoch ms of the last trade the price reflects. */
   marketTime: number;
   high52?: number;
   low52?: number;
   /** Current or most recent regular trading session, epoch ms. */
   session?: { start: number; end: number };
   dividends: Dividend[];
   splits: Split[];
   /**
    * Daily closes by exchange-local date, oldest first, adjusted for splits
    * (not dividends). The last entry may be today's unfinished session.
    */
   closes: DailyClose[];
}

/** One regular session's prices at a few minutes' resolution. */
export interface Intraday {
   /** The session the bars belong to, epoch ms; `end` may still be ahead. */
   session: { start: number; end: number };
   /** Close of the session before; absent if the source omits it. */
   previousClose?: number;
   /** Oldest first; the last one may be the live price. */
   bars: { t: number; price: number }[];
}

export interface DailyClose {
   date: string;
   close: number;
}

/** Units of each currency per 1 USD; always contains `USD: 1`. */
export type FxRates = Record<string, number>;

/** Today's rates as fetched. */
export interface FxSnapshot {
   rates: FxRates;
   /** Publication date of the rates (YYYY-MM-DD), if any were fetched. */
   date?: string;
}

/** Daily units of a currency per 1 USD, oldest first. */
export type RateSeries = { date: string; rate: number }[];

/** Rate series per non-USD currency. */
export type FxHistory = Record<string, RateSeries>;

/** Last fetched market data, kept so the page shows numbers even offline. */
export interface MarketData {
   quotes: Record<string, Quote>;
   fx: FxRates;
   fxDate?: string;
   /** Cached so each refresh only fetches the days since the last one. */
   fxHistory?: FxHistory;
   /** Latest session's prices per held symbol, for the one-day chart. */
   intraday?: Record<string, Intraday>;
   refreshedAt?: number;
}
