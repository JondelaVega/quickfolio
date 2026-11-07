import { backupStatus } from '../../app/backup';
import { eurUsdNow } from '../../app/view';
import { sum } from '../../domain/math';
import { convert } from '../../domain/money';
import { today } from '../../domain/time';
import type { Reporting } from '../../domain/types';
import type { Holding } from '../../domain/valuation';
import { esc } from '../dom';
import { pct, share, tone, weekday, type Format } from '../format';
import { pill, realizedText } from './common';
import type { RenderContext } from './context';

const DIVIDENDS_NOTE = [
   "Gross, before withholding tax, at today's FX.",
   'Not added to the portfolio value: received dividends are already in your cash balance.',
].join(' ');

/** A sold-out stock's headline: what selling it made, not a value of zero. */
function soldOutHero(h: Holding, cur: Reporting, { signedMoney }: Format): string {
   const basis = sum(h.sales, (x) => x.basis);
   const last = h.sales[h.sales.length - 1]?.trade.date;

   return `
        <div class="hero-value ${tone(h.realized)}">${signedMoney(h.realized, cur)}</div>
        <div class="tile-row">
          <span class="pill ${tone(h.realized) || 'flat'}">${pct(basis ? h.realized / basis : undefined)}</span>
          <span class="muted">realized · sold out${last ? ` since ${esc(last)}` : ''}</span>
        </div>`;
}

/** Warnings, the headline tiles and the chips under them. */
export function renderSummary(el: HTMLElement, { state, s, focused, fmt }: RenderContext): void {
   const { money, signedMoney, perShare, qty, moneyAndPct } = fmt;
   const { failed, fxError, fxHistoryError } = state.status;
   const warnings: string[] = [];

   if (state.saveError) {
      warnings.push(state.saveError);
   }

   if (state.storageWarning) {
      warnings.push(state.storageWarning);
   }

   const backup = backupStatus(state, today());
   const reminder = backup.remind
      ? (backup.last
           ? `Your changes since ${backup.last} exist only in this browser.`
           : 'Your trades and cash exist only in this browser.') + ' Use Export JSON under Trades & cash to keep a copy.'
      : undefined;

   if (s.excluded > 0) {
      warnings.push(`${s.excluded} item(s) excluded from totals — see ⚠ in the table.`);
   }

   // Sold-out symbols only feed past dividends and splits; a failure there (often a delisting) is not worth a warning.
   const failedHeld = s.holdings.filter((h) => h.shares > 0 && failed.has(h.symbol)).map((h) => h.symbol);

   if (failedHeld.length > 0) {
      warnings.push(`Refresh failed for ${failedHeld.join(', ')}; showing last known price.`);
   }

   if (fxError) {
      warnings.push(`FX refresh failed: ${fxError}`);
   }

   if (fxHistoryError) {
      warnings.push(`FX history refresh failed (${fxHistoryError}); the chart may have gaps.`);
   }

   const cur = s.base;
   const one = focused ? s.holdings[0] : undefined;
   const soldOut = one !== undefined && one.shares === 0 && !one.issue;
   const hasFx = s.holdings.some((h) => h.currency !== cur);
   const otherCur = fmt.altCurrency(cur);
   const totalOther = convert(s.total, cur, otherCur, state.market.fx);
   const rate = eurUsdNow(state.market.fx);
   const rateNote = rate ? ` <span class="muted">· EUR/USD ${rate.toFixed(4)}</span>` : '';
   const priceNote = one?.quote ? ` at <b>${perShare(one.quote.price, one.currency)}</b>` : '';

   const chips = (items: string[]) => items.map((i) => `<span class="chip">${i}</span>`).join('');
   const groups: string[] = [];

   // Currency mix and concentration say nothing about a single stock.
   if (s.exposure.length > 0 && !one) {
      groups.push(
         `<div class="chip-group"><span class="chip-label">Currency</span>${chips(
            s.exposure.map((e) => `<b>${esc(e.currency)}</b> ${share(e.weight)}`),
         )}</div>`,
      );
   }

   if (s.largest && !one) {
      const items = [`<b>${esc(s.largest.symbol)}</b> ${share(s.largest.weight)}`];

      if (s.top3Weight !== undefined) {
         items.push(`<b>Top 3</b> ${share(s.top3Weight)}`);
      }

      groups.push(`<div class="chip-group"><span class="chip-label">Largest</span>${chips(items)}</div>`);
   }

   if (s.sales.length > 0) {
      const year = today().slice(0, 4);
      const ytd = s.sales.filter((x) => x.trade.date.startsWith(year));
      const items = [`<b class="${tone(s.realized)}">${realizedText(s.sales, cur, fmt)}</b> all time`];

      if (ytd.length) {
         items.push(`<b class="${tone(sum(ytd, (x) => x.gain))}">${realizedText(ytd, cur, fmt)}</b> in ${year}`);
      }

      groups.push(`<div class="chip-group"><span class="chip-label">Realized</span>${chips(items)}</div>`);
   }

   if (!fmt.hidden) {
      groups.push(
         `<div class="chip-group"><span class="chip-label">Cost basis</span>${chips([
            `<b>${money(s.costBasis, cur, 0)}</b>${s.fees > 0 ? ` incl. ${money(s.fees, cur, 0)} fees` : ''}`,
         ])}</div>`,
      );
   }

   el.innerHTML = `
    ${
       warnings.length
          ? `<div class="banner" role="status"><span class="banner-icon"
      aria-hidden="true">!</span><div>${warnings.map(esc).join('<br>')}</div></div>`
          : ''
    }
    ${
       reminder
          ? `<div class="banner" role="status"><span class="banner-icon"
      aria-hidden="true">!</span><div>${esc(reminder)}</div><button type="button" class="btn btn-sm"
      data-dismiss-backup>Dismiss</button></div>`
          : ''
    }
    <div class="kpis">
      <div class="tile tile-hero">
        <div class="tile-label">${
           one ? `<b>${esc(one.symbol)}</b>${one.quote?.name ? ` · ${esc(one.quote.name)}` : ''}` : 'Portfolio value'
        }</div>
        ${
           soldOut
              ? soldOutHero(one, cur, fmt)
              : `
        <div class="hero-value">${money(s.total, cur)}</div>
        ${totalOther !== undefined && !fmt.hidden ? `<div class="hero-alt">≈ ${money(totalOther, otherCur)}${rateNote}</div>` : ''}
        <div class="tile-row">
          ${pill(s.dayChange, moneyAndPct(signedMoney(s.dayChange, cur), pct(s.dayPct)))}
          <span class="muted">${s.day === undefined || s.day === today() ? 'today' : `on ${weekday(s.day)}`}</span>
        </div>`
        }
        <div class="tile-foot">${
           !one
              ? `<span>Invested <b>${money(s.invested, cur, 0)}</b> · ${share(s.total ? s.invested / s.total : undefined)}</span>
          <span>Cash <b>${money(s.cashValue, cur, 0)}</b> · ${share(s.total ? s.cashValue / s.total : undefined)}</span>`
              : !soldOut
                ? `<span><b>${qty(one.shares)}</b> shares${priceNote}</span>
          <span><b>${share(one.weight)}</b> of portfolio</span>`
                : `<span>Proceeds <b>${money(
                     sum(one.sales, (x) => x.proceeds),
                     cur,
                     0,
                  )}</b></span>
          <span>Cost <b>${money(
             sum(one.sales, (x) => x.basis),
             cur,
             0,
          )}</b></span>`
        }</div>
      </div>
      <div class="tile">
        <div class="tile-label">Unrealized P/L</div>
        <div class="tile-value ${tone(s.pl)}">${signedMoney(s.pl, cur, 0)}</div>
        <div class="tile-row">${pill(s.plPct, pct(s.plPct))}</div>
        ${(() => {
           if (!hasFx) {
              return '';
           }

           // While amounts are hidden, the split is shown as a share of cost, adding up to the pill.
           const part = (v: number) => (fmt.hidden ? pct(s.costBasis ? v / s.costBasis : undefined) : signedMoney(v, cur, 0));

           return `<div class="tile-foot"><span>Price <b>${part(s.pricePl)}</b></span><span>FX <b>${part(s.fxPl)}</b></span></div>`;
        })()}
      </div>
      <div class="tile" title="Money-weighted, dividends included. Shown once the oldest purchase is a year old.">
        <div class="tile-label">Annualized</div>
        <div class="tile-value ${tone(s.annualized)}">${pct(s.annualized, { digits: 1 })}</div>
        <div class="tile-foot"><span>per year, incl. dividends</span></div>
      </div>
      <div class="tile" title="${DIVIDENDS_NOTE}">
        <div class="tile-label">Dividends</div>
        <div class="tile-value">${money(s.dividends, cur, 0)}</div>
        <div class="tile-foot"><span>since purchase, gross est.</span></div>
      </div>
    </div>
    <div class="chips">${groups.join('')}</div>
  `;
}
