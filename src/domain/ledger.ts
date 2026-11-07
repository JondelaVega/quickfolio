import type { Quote } from './market';
import { sum } from './math';
import { currentShares } from './trade';
import type { Trade } from './types';

/** Share differences below this are rounding (split ratios, brokers rounding fractional shares), not holdings. */
export const SHARE_EPSILON = 1e-6;

/** A buy and what is left of it after the sales matched against it. */
export interface Position {
   buy: Trade;
   /** Shares the buy represents today, after later splits. */
   shares: number;
   /** `shares` not yet sold. */
   remaining: number;
   /** Sales that consumed part of this buy, in today's shares, oldest first. */
   closures: { sale: Trade; shares: number }[];
}

/** A sale and the buys it consumed. */
export interface Match {
   sale: Trade;
   /** Shares sold, in today's shares. */
   shares: number;
   /** Consumed buys, oldest first; their shares add up to `shares - unmatched`. */
   lots: { buy: Trade; shares: number }[];
   /** Shares sold beyond what was held on the sale date; non-zero means the ledger is inconsistent. */
   unmatched: number;
}

/**
 * Matches one symbol's sales against its buys first-in, first-out.
 *
 * Shares are compared in today's split-adjusted units, so a buy before a
 * split and a sale after it line up. Trades on the same date are taken buys
 * first: a same-day buy is available to a same-day sale.
 *
 * - Parameters:
 *   - trades: The symbol's trades in any order.
 *   - sharesToday: The trade's quantity converted to today's shares.
 * - Returns: Every buy as a position (fully sold ones included, for history) and every sale's match.
 */
export function matchFifo(trades: Trade[], sharesToday: (t: Trade) => number): { positions: Position[]; matches: Match[] } {
   const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1));
   const positions: Position[] = [];
   const matches: Match[] = [];

   for (const t of ordered) {
      const shares = sharesToday(t);

      if (t.side === 'buy') {
         positions.push({ buy: t, shares, remaining: shares, closures: [] });
         continue;
      }

      const match: Match = { sale: t, shares, lots: [], unmatched: 0 };
      let left = shares;

      for (const p of positions) {
         if (left <= SHARE_EPSILON) {
            break;
         }

         if (p.remaining <= SHARE_EPSILON) {
            continue;
         }

         const take = Math.min(p.remaining, left);

         p.remaining -= take;
         p.closures.push({ sale: t, shares: take });
         match.lots.push({ buy: p.buy, shares: take });
         left -= take;
      }

      match.unmatched = left > SHARE_EPSILON ? left : 0;
      matches.push(match);
   }

   for (const p of positions) {
      if (p.remaining <= SHARE_EPSILON) {
         p.remaining = 0;
      }
   }

   return { positions, matches };
}

/** Shares of a position still held at the given time, after sales up to and including that day. */
export const heldAt = (p: Position, date: string) =>
   p.shares -
   sum(
      p.closures.filter((c) => c.sale.date <= date),
      (c) => c.shares,
   );

/** One symbol's trades matched in today's shares; without a quote the splits are unknown, so none are assumed. */
const matchSymbol = (trades: Trade[], symbol: string, quote: Quote | undefined) =>
   matchFifo(
      trades.filter((t) => t.symbol === symbol),
      (t) => (quote ? currentShares(t, quote) : t.quantity),
   );

/** Today's shares of `symbol` left after every recorded sale. */
export function sharesHeld(trades: Trade[], symbol: string, quote: Quote | undefined): number {
   return sum(matchSymbol(trades, symbol, quote).positions, (p) => p.remaining);
}

/** The first sale of the symbol that sells more shares than were held, if any. */
export function firstOversold(trades: Trade[], symbol: string, quote: Quote | undefined): Match | undefined {
   return matchSymbol(trades, symbol, quote).matches.find((m) => m.unmatched > 0);
}
