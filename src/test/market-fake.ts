// A stand-in for Yahoo Finance and Frankfurter that answers the app's requests the way they would, with
// made-up but consistent data: smooth daily prices ending at today's quote, quarterly dividends, an AAPL
// split, sessions in each exchange's hours and ECB-style daily rates on business days.
import { DAY, tradeTime } from '../domain/time';

interface Instrument {
   /** As Yahoo reports it, which for London is pence (GBp). */
   currency: string;
   name: string;
   /** Today's price, and its change from yesterday's close in percent. */
   price: number;
   change: number;
   /** Price on EPOCH; the path in between grows smoothly, with a wiggle. */
   start: number;
   /** Session open in UTC hours and its UTC offset in seconds, as Yahoo reports it. */
   open: number;
   gmtoffset: number;
   /** Paid every February, May, August and November. */
   dividend: number;
   splits?: { date: string; ratio: number }[];
}

const INSTRUMENTS: Record<string, Instrument> = {
   AAPL: {
      currency: 'USD',
      name: 'Apple Inc.',
      price: 270,
      change: 1.2,
      start: 40,
      open: 14.5,
      gmtoffset: -18000,
      dividend: 0.25,
      splits: [{ date: '2020-08-31', ratio: 4 }],
   },
   MSFT: {
      currency: 'USD',
      name: 'Microsoft Corporation',
      price: 500,
      change: -0.8,
      start: 90,
      open: 14.5,
      gmtoffset: -18000,
      dividend: 0.8,
   },
   'NOKIA.HE': {
      currency: 'EUR',
      name: 'Nokia Oyj',
      price: 5.6,
      change: 0.5,
      start: 4.5,
      open: 7,
      gmtoffset: 7200,
      dividend: 0.03,
   },
   'ASML.AS': {
      currency: 'EUR',
      name: 'ASML Holding N.V.',
      price: 900,
      change: -1.5,
      start: 150,
      open: 8,
      gmtoffset: 3600,
      dividend: 1.6,
   },
   'VOD.L': {
      currency: 'GBp',
      name: 'Vodafone Group Plc',
      price: 72,
      change: 0.3,
      start: 150,
      open: 8,
      gmtoffset: 0,
      dividend: 2,
   },
};

/** Where every price path starts. */
const EPOCH = tradeTime('2018-01-02');
const SESSION_MS = 8.5 * 3_600_000;

/** Units of each currency per USD on a day, gently moving. */
const USD_RATES: Record<string, (day: number) => number> = {
   EUR: (d) => 0.88 + 0.05 * Math.sin(d / 45),
   GBP: (d) => 0.76 + 0.03 * Math.sin(d / 50),
};

const isWeekday = (ms: number) => ![0, 6].includes(new Date(ms).getUTCDay());
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;
/** The latest business day at or before `ms`. */
const businessDay = (ms: number) => {
   let d = dayStart(ms);

   while (!isWeekday(d)) {
      d -= DAY;
   }

   return d;
};

export interface FakeResponse {
   ok: boolean;
   status: number;
   json: () => Promise<unknown>;
}

export interface FakeMarket {
   /** Answers a request as `fetch` would; anything outside the two APIs is refused. */
   fetch: (input: string | URL) => Promise<FakeResponse>;
   /** Makes every later price request for `symbol` fail, as an outage would. */
   fail: (symbol: string) => void;
   /** Every URL requested so far. */
   requests: string[];
   /** Requests whose answer the app hasn't received yet. */
   readonly pending: number;
}

/** A market as seen at `now` (epoch ms). */
export function fakeMarket(now: number): FakeMarket {
   const failing = new Set<string>();
   const requests: string[] = [];
   let pending = 0;
   const today = dayStart(now);
   const lastSession = (i: Instrument) => {
      // Before today's open, the latest session is the previous business day's.
      let d = businessDay(now);

      if (d + i.open * 3_600_000 > now) {
         d = businessDay(d - DAY);
      }

      return d;
   };

   /** Close on a business day; yesterday's matches today's change, and the path runs smoothly before it. */
   function closeOn(i: Instrument, day: number): number {
      const session = lastSession(i);

      if (day >= session) {
         return i.price;
      }

      const previous = i.price / (1 + i.change / 100);
      const shape = (d: number) =>
         i.start * (i.price / i.start) ** ((d - EPOCH) / (today - EPOCH)) * (1 + 0.04 * Math.sin(d / DAY / 11));

      return (previous * shape(day)) / shape(businessDay(session - DAY));
   }

   function chart(symbol: string, query: URLSearchParams): { status: number; body: unknown } {
      const i = INSTRUMENTS[symbol];

      if (!i || failing.has(symbol)) {
         return failing.has(symbol)
            ? { status: 502, body: undefined }
            : {
                 status: 404,
                 body: {
                    chart: {
                       result: null,
                       error: { code: 'Not Found', description: 'No data found, symbol may be delisted' },
                    },
                 },
              };
      }

      const session = lastSession(i);
      const start = session + i.open * 3_600_000;
      const end = start + SESSION_MS;
      const previous = i.price / (1 + i.change / 100);
      const meta = {
         symbol,
         currency: i.currency,
         longName: i.name,
         regularMarketPrice: i.price,
         regularMarketChangePercent: i.change,
         regularMarketTime: Math.floor(Math.min(now, end) / 1000),
         gmtoffset: i.gmtoffset,
         currentTradingPeriod: { regular: { start: start / 1000, end: end / 1000 } },
      };

      if (query.get('range') === '1d') {
         // Bars every five minutes from the open until now or the close, drifting from yesterday's close.
         const bars: number[] = [];

         for (let t = start; t <= Math.min(now, end); t += 300_000) {
            bars.push(t);
         }

         const span = Math.max(Math.min(now, end) - start, 1);
         const price = (t: number) =>
            previous + (i.price - previous) * ((t - start) / span) + previous * 0.003 * Math.sin(t / 1_800_000);

         return {
            status: 200,
            body: {
               chart: {
                  result: [
                     {
                        meta: {
                           ...meta,
                           chartPreviousClose: previous,
                           tradingPeriods: [[{ start: start / 1000, end: end / 1000 }]],
                        },
                        timestamp: bars.map((t) => t / 1000),
                        indicators: { quote: [{ close: bars.map((t, n) => (n === bars.length - 1 ? i.price : price(t))) }] },
                     },
                  ],
                  error: null,
               },
            },
         };
      }

      const from = Math.max(dayStart(Number(query.get('period1')) * 1000), EPOCH);
      const to = Math.min(Number(query.get('period2')) * 1000, now);
      const days: number[] = [];

      for (let d = from; d <= to; d += DAY) {
         if (isWeekday(d) && d <= session) {
            days.push(d);
         }
      }

      const closes = days.map((d) => closeOn(i, d));
      const lastYear = days.filter((d) => d > today - 365 * DAY).map((d) => closeOn(i, d));
      const at = (d: number) => (d + i.open * 3_600_000) / 1000;
      const dividends = days.filter((d) => [1, 4, 7, 10].includes(new Date(d).getUTCMonth()) && new Date(d).getUTCDate() === 10);
      const splits = (i.splits ?? []).filter((s) => tradeTime(s.date) >= from && tradeTime(s.date) <= to);

      return {
         status: 200,
         body: {
            chart: {
               result: [
                  {
                     meta: {
                        ...meta,
                        fiftyTwoWeekHigh: Math.max(i.price, ...lastYear),
                        fiftyTwoWeekLow: Math.min(i.price, ...lastYear),
                        chartPreviousClose: closes[0],
                     },
                     events: query.get('events')
                        ? {
                             dividends: Object.fromEntries(dividends.map((d) => [at(d), { date: at(d), amount: i.dividend }])),
                             splits: Object.fromEntries(
                                splits.map((s) => [
                                   at(tradeTime(s.date)),
                                   { date: at(tradeTime(s.date)), numerator: s.ratio, denominator: 1 },
                                ]),
                             ),
                          }
                        : undefined,
                     timestamp: days.map(at),
                     indicators: { quote: [{ close: closes }] },
                  },
               ],
               error: null,
            },
         },
      };
   }

   /** Frankfurter's `v2/rates`: one row per business day and quote currency. */
   function rates(query: URLSearchParams): { status: number; body: unknown } {
      const base = query.get('base') ?? 'EUR';
      const quotes = (query.get('quotes') ?? '').split(',').filter(Boolean);
      const perUsd = (c: string, d: number) => (c === 'USD' ? 1 : USD_RATES[c]?.((d - EPOCH) / DAY));
      const row = (quote: string, d: number) => {
         const q = perUsd(quote, d);
         const b = perUsd(base, d);

         return q === undefined || b === undefined ? [] : [{ date: dateOf(d), base, quote, rate: q / b }];
      };

      if (quotes.some((q) => perUsd(q, today) === undefined) || perUsd(base, today) === undefined) {
         return { status: 422, body: { message: `Unknown currency in ${[base, ...quotes].join(',')}` } };
      }

      const from = query.get('from');

      if (from) {
         const rows = [];

         for (let d = tradeTime(from); d <= Math.min(tradeTime(query.get('to')!), now); d += DAY) {
            if (isWeekday(d)) {
               rows.push(...quotes.flatMap((q) => row(q, d)));
            }
         }

         return { status: 200, body: rows };
      }

      const date = query.get('date');
      const day = businessDay(date ? tradeTime(date) : now);

      return { status: 200, body: quotes.flatMap((q) => row(q, day)) };
   }

   function respond(url: string): { status: number; body: unknown } {
      const { pathname, searchParams } = new URL(url, 'http://localhost');
      const symbol = pathname.match(/^\/api\/yahoo\/v8\/finance\/chart\/([^/]+)$/)?.[1];

      if (symbol) {
         return chart(decodeURIComponent(symbol), searchParams);
      }

      if (pathname === '/api/fx/v2/rates') {
         return rates(searchParams);
      }

      throw new Error(`Unexpected request to ${url}`);
   }

   return {
      async fetch(input) {
         const url = String(input);

         requests.push(url);
         pending++;

         try {
            // A tick of latency, so the page sees the request in flight as it would.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const { status, body } = respond(url);

            return {
               ok: status >= 200 && status < 300,
               status,
               json: async () =>
                  body === undefined ? Promise.reject(new SyntaxError('Unexpected end of JSON input')) : structuredClone(body),
            };
         } finally {
            pending--;
         }
      },
      fail: (symbol) => void failing.add(symbol),
      requests,
      get pending() {
         return pending;
      },
   };
}
