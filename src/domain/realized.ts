import type { Sale } from './valuation';

/** Realized gain per calendar year of the sale, oldest year first. */
export function realizedByYear(sales: Sale[]): Record<string, number> {
   const out: Record<string, number> = {};

   for (const s of sales) {
      const year = s.trade.date.slice(0, 4);

      out[year] = (out[year] ?? 0) + s.gain;
   }

   return out;
}
