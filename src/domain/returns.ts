import { DAY } from './time';

const YEAR = 365.25 * DAY;

export interface Flow {
   t: number;
   /** Negative for money invested, positive for money returned. */
   amount: number;
}

/** Annualized money-weighted return of the flows, or undefined if there is none. */
export function xirr(flows: Flow[]): number | undefined {
   if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) {
      return undefined;
   }

   const t0 = Math.min(...flows.map((f) => f.t));
   const npv = (r: number) => flows.reduce((s, f) => s + f.amount / (1 + r) ** ((f.t - t0) / YEAR), 0);
   // NPV falls as the rate rises for invest-then-return flows; bisect for its root.
   let lo = -0.99;
   let hi = 1;

   while (npv(hi) > 0 && hi < 1e6) {
      hi *= 2;
   }

   if (npv(lo) < 0 || npv(hi) > 0) {
      return undefined;
   }

   for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;

      if (npv(mid) > 0) {
         lo = mid;
      } else {
         hi = mid;
      }
   }

   return (lo + hi) / 2;
}
