// Builders shared by the test suites: a fixed clock, quotes and trades with sensible defaults.
import { matchFifo } from '../domain/ledger';
import type { Quote } from '../domain/market';
import { tradeTime } from '../domain/time';
import { currentShares } from '../domain/trade';
import type { Trade } from '../domain/types';

export const NOW = tradeTime('2026-11-05') + 15 * 3_600_000;
export const at = (date: string, hourUtc = 13.5) => tradeTime(date) + hourUtc * 3_600_000;

export const quote = (symbol: string, currency: string, price: number, extra: Partial<Quote> = {}): Quote => ({
   symbol,
   currency,
   price,
   previousClose: price,
   marketTime: NOW,
   dividends: [],
   splits: [],
   closes: [],
   ...extra,
});

export const lot = (l: Partial<Trade> & Pick<Trade, 'symbol' | 'quantity' | 'gross'>): Trade => ({
   id: `${l.side ?? 'buy'}-${l.symbol}-${l.date ?? '2026-01-02'}`,
   side: 'buy',
   date: '2026-01-02',
   currency: 'USD',
   fees: 0,
   fxRate: 1,
   // Fees default to the instrument's currency, as they did before fee currencies existed.
   feeCurrency: l.currency ?? 'USD',
   feeFxRate: l.fxRate ?? 1,
   settledIn: l.currency ?? 'USD',
   eurUsd: l.currency === 'EUR' ? l.fxRate : undefined,
   unitPrice: l.gross / l.quantity,
   settled: l.gross,
   ...l,
});
export const sell = (l: Partial<Trade> & Pick<Trade, 'symbol' | 'quantity' | 'gross'>): Trade => lot({ side: 'sell', ...l });

/** Every buy as a position, sales applied, the way the summary derives them. */
export const positionsOf = (trades: Trade[], quotes: Record<string, Quote>) =>
   [...new Set(trades.map((t) => t.symbol))].flatMap(
      (symbol) =>
         matchFifo(
            trades.filter((t) => t.symbol === symbol),
            (t) => currentShares(t, quotes[symbol]!),
         ).positions,
   );
