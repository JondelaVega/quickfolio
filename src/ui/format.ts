import type { FxRates } from '../domain/market';
import { convert } from '../domain/money';
import type { Reporting } from '../domain/types';

/** Stands in for a hidden amount. */
export const MASK = '•••';

export function formatMoney(value: number, currency: string, digits = 2): string {
   try {
      return new Intl.NumberFormat('en-US', {
         style: 'currency',
         currency,
         minimumFractionDigits: digits,
         maximumFractionDigits: digits,
      }).format(value);
   } catch {
      // Unreachable for validated codes; letters only, so the result is safe in markup and text alike.
      return `${value.toFixed(digits)} ${currency.replace(/[^A-Za-z]/g, '')}`;
   }
}

export const pct = (v: number | undefined, { signed = true, digits = signed ? 2 : 1 }: { signed?: boolean; digits?: number } = {}) =>
   v === undefined ? '—' : `${signed && v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
/** A share of a whole: unsigned, one decimal. */
export const share = (v: number | undefined) => pct(v, { signed: false });
/** CSS class for a gain or a loss. */
export const tone = (v: number | undefined) => (v === undefined || v === 0 ? '' : v > 0 ? 'pos' : 'neg');
export const time = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/** "Fri" for a `YYYY-MM-DD` date. */
export const weekday = (date: string) =>
   new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

/** Formatters for amounts, which depend on whether amounts are hidden and on today's rates. */
export interface Format {
   hidden: boolean;
   /** An amount; masked while amounts are hidden. */
   money: (value: number, currency: string, digits?: number) => string;
   signedMoney: (value: number, currency: string, digits?: number) => string;
   /** A price per share: always shown, since it says nothing about the portfolio's size. */
   perShare: (value: number, currency: string) => string;
   /** A share count: masked while amounts are hidden, since shares × price is the position's value. */
   qty: (value: number) => string;
   /** "+$194 · +0.97%", or just the percentage while amounts are hidden. */
   moneyAndPct: (moneyText: string, pctText: string) => string;
   /** "≈ €1,234" for an amount shown in its own currency, at today's rate; empty if no rate or while hidden. */
   approx: (amount: number, currency: string, digits?: number) => string;
   /** The other reporting currency for a USD or EUR amount; the reporting currency for anything else. */
   altCurrency: (currency: string) => string;
}

/**
 * Every figure that reveals the portfolio's size is formatted through the
 * returned `money` or `qty`, so hiding amounts is decided in this one place.
 */
export function createFormat({ hideAmounts, fx, reporting }: { hideAmounts: boolean; fx: FxRates; reporting: Reporting }): Format {
   const money = (value: number, currency: string, digits = 2) => (hideAmounts ? MASK : formatMoney(value, currency, digits));
   const altCurrency = (currency: string): string => (currency === 'USD' ? 'EUR' : currency === 'EUR' ? 'USD' : reporting);

   return {
      hidden: hideAmounts,
      money,
      signedMoney: (v, currency, digits = 2) => (v > 0 ? '+' : '') + money(v, currency, digits),
      perShare: (v, currency) => formatMoney(v, currency),
      qty: (v) => (hideAmounts ? MASK : new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(v)),
      moneyAndPct: (moneyText, pctText) => (hideAmounts ? pctText : `${moneyText} · ${pctText}`),
      approx(amount, currency, digits = 2) {
         if (hideAmounts) {
            return '';
         }

         const to = altCurrency(currency);
         const v = to === currency ? undefined : convert(amount, currency, to, fx);

         return v === undefined ? '' : `≈ ${money(v, to, digits)}`;
      },
      altCurrency,
   };
}
