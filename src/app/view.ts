import type { FxRates } from '../domain/market';
import { summarize, type Summary } from '../domain/valuation';
import type { AppState } from './state';

/** The focused symbol, unless it has no trades left or the portfolio only ever held one stock. */
export function focusedSymbol({ portfolio, view }: AppState): string | undefined {
   const symbols = new Set(portfolio.trades.map((t) => t.symbol));

   return view.focus && symbols.has(view.focus) && symbols.size > 1 ? view.focus : undefined;
}

/** What the dashboard shows. */
export interface View {
   /** The whole portfolio, or only the focused stock's trades without cash. */
   s: Summary;
   /** Always the whole portfolio. */
   full: Summary;
   focused?: string;
}

export function viewSummary(state: AppState): View {
   const { portfolio, market, view } = state;
   const full = summarize(portfolio, market.quotes, market.fx, view.reporting);
   const focused = focusedSymbol(state);

   if (!focused) {
      return { s: full, full };
   }

   const trades = portfolio.trades.filter((t) => t.symbol === focused);
   const s = summarize({ trades, cash: {} }, market.quotes, market.fx, view.reporting);

   // Within a one-stock view the weight would always be 100%; keep its share of the whole portfolio.
   for (const h of s.holdings) {
      h.weight = full.holdings.find((f) => f.symbol === h.symbol)?.weight;
   }

   return { s, full, focused };
}

/** Today's USD per 1 EUR, if the rate is known. */
export const eurUsdNow = (fx: FxRates) => (fx.EUR ? 1 / fx.EUR : undefined);
