import type { Holding } from './valuation';

/** Ring segments beyond this fold into "Other"; past ~6 a ring stops being readable at a glance. */
const MAX_SEGMENTS = 6;

export interface Slice {
   symbol: string;
   name?: string;
   /** In the summary's reporting currency. */
   value: number;
   /** Share of invested value (cash excluded). */
   share: number;
   /** Categorical slot, 0-based; `undefined` for the folded "Other" slice. */
   slot?: number;
   /** Holdings folded into this slice; set only on "Other". */
   folded?: number;
}

/** Earliest buy among the shares still held; only called on holdings with a value, which hold some. */
const firstPurchase = (h: Holding) => h.open.reduce((d, p) => (p.buy.date < d ? p.buy.date : d), h.open[0]!.buy.date);

/**
 * Splits invested value into ring segments.
 *
 * Segments run from the largest to the smallest, with "Other" last. Colors
 * follow the holding, assigned by first purchase date, so a holding keeps its
 * color as prices move and the order changes.
 */
export function allocationSlices(holdings: Holding[]): Slice[] {
   const priced = holdings.filter((h) => !h.issue && h.value !== undefined && h.value > 0);
   const total = priced.reduce((s, h) => s + h.value!, 0);

   if (total <= 0) {
      return [];
   }

   const ranked = [...priced].sort((a, b) => b.value! - a.value! || a.symbol.localeCompare(b.symbol));
   const shown = ranked.slice(0, ranked.length <= MAX_SEGMENTS ? MAX_SEGMENTS : MAX_SEGMENTS - 1);
   const rest = ranked.slice(shown.length);
   const byPurchase = [...shown].sort((a, b) => firstPurchase(a).localeCompare(firstPurchase(b)) || a.symbol.localeCompare(b.symbol));
   const slices: Slice[] = shown.map((h) => ({
      symbol: h.symbol,
      name: h.quote?.name,
      value: h.value!,
      share: h.value! / total,
      slot: byPurchase.indexOf(h),
   }));

   if (rest.length > 0) {
      const value = rest.reduce((s, h) => s + h.value!, 0);

      slices.push({ symbol: 'Other', value, share: value / total, folded: rest.length });
   }

   return slices;
}
