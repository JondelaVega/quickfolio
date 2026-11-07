import { sum } from '../../domain/math';
import type { Reporting } from '../../domain/types';
import type { Sale } from '../../domain/valuation';
import { pct, share, tone, type Format } from '../format';

/** A secondary line under a cell's main figure; nothing when empty. */
export const sub = (html: string, cls = '') => (html ? `<span class="sub-line ${cls}">${html}</span>` : '');

export const pill = (v: number | undefined, text: string) => `<span class="pill ${tone(v) || 'flat'}">${text}</span>`;

/** Weight as a figure over a thin meter (track is a lighter step of the same hue). */
export const weightCell = (w: number | undefined) =>
   w === undefined
      ? '—'
      : `${share(w)}<span class="meter" aria-hidden="true"><span style="width:${Math.min(Math.max(w, 0), 1) * 100}%"></span></span>`;

/** A set of sales' realized gain, or while amounts are hidden its return on the cost of the shares sold. */
export function realizedText(sales: Sale[], cur: Reporting, fmt: Format): string {
   const gain = sum(sales, (x) => x.gain);
   const basis = sum(sales, (x) => x.basis);

   return fmt.hidden ? pct(basis ? gain / basis : undefined) : fmt.signedMoney(gain, cur, 0);
}
