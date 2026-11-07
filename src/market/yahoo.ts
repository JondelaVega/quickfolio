// Yahoo Finance chart API, reached through the /api/yahoo dev-server proxy (Yahoo sends no CORS headers).
import { isCurrencyCode } from '../domain/codes';
import type { Intraday, Quote } from '../domain/market';

// Some exchanges quote in minor units; Yahoo marks them with a non-ISO code.
const MINOR_UNITS: Record<string, [currency: string, divisor: number]> = {
   GBp: ['GBP', 100],
   GBX: ['GBP', 100],
   ILA: ['ILS', 100],
   ZAc: ['ZAR', 100],
};

/** A response field used only if it has the expected type, so a malformed one can't break rendering later. */
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const text = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** The ISO currency and divisor for a minor-unit code; never an inherited property. */
const minorUnits = (code: string) => (Object.hasOwn(MINOR_UNITS, code) ? MINOR_UNITS[code] : undefined);

interface ChartMeta {
   symbol?: string;
   currency?: string;
   regularMarketPrice?: number;
   regularMarketChangePercent?: number;
   regularMarketTime?: number;
   /** Exchange's current UTC offset in seconds. */
   gmtoffset?: number;
   fiftyTwoWeekHigh?: number;
   fiftyTwoWeekLow?: number;
   longName?: string;
   shortName?: string;
   currentTradingPeriod?: { regular?: { start: number; end: number } };
   /** Sessions covered by an intraday range; the first is the one the bars belong to. */
   tradingPeriods?: { start: number; end: number }[][];
   /** Close before the first bar of the range. */
   chartPreviousClose?: number;
}

type Dividend = { date: number; amount: number };
type Split = { date: number; numerator: number; denominator: number };

interface ChartEvents {
   dividends?: Record<string, Dividend | null>;
   splits?: Record<string, Split | null>;
}

interface ChartResult {
   meta?: ChartMeta;
   events?: ChartEvents;
   timestamp?: number[];
   indicators?: { quote?: { close?: (number | null)[] }[] };
}

type ChartBody = {
   chart?: { result?: ChartResult[] | null; error?: { description?: string } | null };
};

/** Extracts a quote from a Yahoo `v8/finance/chart` response body. */
export function parseYahooChart(body: unknown, symbol: string): Quote {
   const chart = (body as ChartBody | null)?.chart;
   const result = chart?.result?.[0];
   const meta = result?.meta;

   if (!meta || typeof meta.regularMarketPrice !== 'number' || !meta.currency) {
      throw new Error(chart?.error?.description ?? `No quote for ${symbol}`);
   }

   const [currency, divisor] = minorUnits(meta.currency) ?? [meta.currency, 1];

   // The currency is stored on trades and shown in the page: only a well-formed code is accepted.
   if (!isCurrencyCode(currency)) {
      throw new Error(`${symbol} is quoted in an unsupported currency`);
   }

   const price = meta.regularMarketPrice / divisor;
   // With a multi-year range, chartPreviousClose is the close before the range
   // starts, so yesterday's close is derived from today's change instead.
   const change = meta.regularMarketChangePercent;
   const session = meta.currentTradingPeriod?.regular;
   const ev = result.events ?? {};

   // Bars are stamped at the session open; shifting by the exchange's offset
   // gives the local trading date (DST never moves an open across midnight).
   const offset = num(meta.gmtoffset) ?? 0;
   const rawCloses = result.indicators?.quote?.[0]?.close ?? [];
   const closes = (result.timestamp ?? []).flatMap((t, i) => {
      const close = rawCloses[i];

      if (typeof close !== 'number') {
         return [];
      }

      return [{ date: new Date((t + offset) * 1000).toISOString().slice(0, 10), close: close / divisor }];
   });

   return {
      symbol: meta.symbol ?? symbol,
      name: text(meta.longName) ?? text(meta.shortName),
      currency,
      price,
      previousClose: typeof change === 'number' ? price / (1 + change / 100) : undefined,
      marketTime: (num(meta.regularMarketTime) ?? Date.now() / 1000) * 1000,
      high52: num(meta.fiftyTwoWeekHigh) !== undefined ? meta.fiftyTwoWeekHigh! / divisor : undefined,
      low52: num(meta.fiftyTwoWeekLow) !== undefined ? meta.fiftyTwoWeekLow! / divisor : undefined,
      session:
         num(session?.start) !== undefined && num(session?.end) !== undefined
            ? { start: session!.start * 1000, end: session!.end * 1000 }
            : undefined,
      dividends: Object.values(ev.dividends ?? {})
         .filter((d): d is Dividend => d !== null && num(d.date) !== undefined && num(d.amount) !== undefined)
         .map((d) => ({ date: d.date * 1000, amount: d.amount / divisor }))
         .sort((a, b) => a.date - b.date),
      splits: Object.values(ev.splits ?? {})
         .filter(
            (s): s is Split =>
               s !== null && num(s.date) !== undefined && num(s.numerator) !== undefined && (num(s.denominator) ?? 0) > 0,
         )
         .map((s) => ({ date: s.date * 1000, ratio: s.numerator / s.denominator }))
         .sort((a, b) => a.date - b.date),
      closes,
   };
}

/** Extracts the session's bars from a Yahoo `v8/finance/chart` response with `range=1d`. */
export function parseYahooIntraday(body: unknown, symbol: string): Intraday {
   const chart = (body as ChartBody | null)?.chart;
   const result = chart?.result?.[0];
   const meta = result?.meta;
   const period = meta?.tradingPeriods?.[0]?.[0] ?? meta?.currentTradingPeriod?.regular;

   if (!result || !meta?.currency || !period) {
      throw new Error(chart?.error?.description ?? `No intraday prices for ${symbol}`);
   }

   const divisor = minorUnits(meta.currency)?.[1] ?? 1;
   const closes = result.indicators?.quote?.[0]?.close ?? [];
   const bars = (result.timestamp ?? []).flatMap((t, i) => {
      const close = closes[i];

      return typeof close === 'number' ? [{ t: t * 1000, price: close / divisor }] : [];
   });

   return {
      session: { start: period.start * 1000, end: period.end * 1000 },
      previousClose: num(meta.chartPreviousClose) !== undefined ? meta.chartPreviousClose! / divisor : undefined,
      bars,
   };
}

async function getChart(symbol: string, query: string): Promise<unknown> {
   const res = await fetch(`/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`);
   const body: unknown = await res.json().catch(() => null);

   if (body === null) {
      throw new Error(`Price request failed (HTTP ${res.status})`);
   }

   return body;
}

export const yahoo = {
   /**
    * Fetches the latest quote plus daily closes, dividends and splits from
    * `since` (epoch ms) onwards. Rejects with a human-readable message when
    * the symbol has no quote.
    */
   async getQuote(symbol: string, since: number): Promise<Quote> {
      const period1 = Math.floor(since / 1000);
      const period2 = Math.floor(Date.now() / 1000);

      return parseYahooChart(await getChart(symbol, `period1=${period1}&period2=${period2}&interval=1d&events=div,split`), symbol);
   },
   /** Fetches the most recent regular session's prices at a few minutes' resolution. */
   async getIntraday(symbol: string): Promise<Intraday> {
      return parseYahooIntraday(await getChart(symbol, 'interval=5m&range=1d'), symbol);
   },
};
