import type { Reporting } from '../../domain/types';
import type { Holding } from '../../domain/valuation';
import { esc } from '../dom';
import { pct, share, time, tone } from '../format';
import { sub, weightCell } from './common';
import type { RenderContext } from './context';

/** Open positions and cash; sold-out symbols live in the realized table, unless their ledger needs attention. */
export function renderHoldings(el: HTMLElement, ctx: RenderContext): void {
   const { s, focused, fmt } = ctx;
   const shown = s.holdings.filter((h) => h.shares > 0 || h.issue);
   const count = shown.length;
   const positions = `${count} position${count === 1 ? '' : 's'}`;
   const header = `<div class="card-header"><h2>Holdings</h2><span class="muted">${positions}</span></div>`;

   if (count === 0 && s.cash.length === 0) {
      const text = focused
         ? `All ${esc(focused)} shares are sold; its sales are under “Realized”.`
         : 'No holdings yet. Add your first purchase under “Trades &amp; cash”.';

      el.innerHTML = `${header}<p class="empty">${text}</p>`;

      return;
   }

   const holdings = [...shown].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

   el.innerHTML = `
    ${header}
    <div class="table-wrap">
      <table class="holdings">
        <thead>
          <tr>
            <th>Symbol</th><th>Shares</th><th>Price</th>
            <th title="Per share as it trades today, fees included (break-even before selling costs)">Avg cost</th>
            <th>Cost</th><th>Value</th>
            <th title="In ${s.base}: price and currency effects, excluding dividends">Return</th>
            <th>Day</th><th title="Gross, since purchase">Dividends</th><th>Weight</th>
          </tr>
        </thead>
        <tbody>
          ${holdings.map((h) => holdingRow(h, s.base, ctx)).join('')}
          ${s.cash
             .map(
                (c) => `
            <tr class="cash">
              <td><div class="sym"><span class="mono mono-cash"
                aria-hidden="true">${esc(c.currency.slice(0, 1))}</span><div><b>Cash</b>${sub(esc(c.currency), 'name')}</div>${
                   c.value === undefined ? `<span class="issue" title="No FX rate for ${esc(c.currency)}">⚠</span>` : ''
                }</div></td>
              <td></td><td></td><td></td><td></td>
              <td>${fmt.money(c.amount, c.currency)}${sub(fmt.approx(c.amount, c.currency))}</td>
              <td></td><td></td><td></td>
              <td>${weightCell(c.weight)}</td>
            </tr>`,
             )
             .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function holdingRow(h: Holding, base: Reporting, { state, focused, fmt }: RenderContext): string {
   const { money, perShare, qty, approx } = fmt;
   const q = h.quote;
   const failure = state.status.failed.get(h.symbol);
   const issue =
      !q && failure
         ? failure
         : (h.issue ?? (failure && q ? `Refresh failed (${failure}); price from ${time(q.marketTime)}` : undefined));
   const priced = h.valueLocal !== undefined;
   const cur = h.currency;

   const priceTitle = q
      ? [`Last trade ${time(q.marketTime)}`, q.low52 && q.high52 ? `52w ${perShare(q.low52, cur)} – ${perShare(q.high52, cur)}` : '']
           .filter(Boolean)
           .join('\n')
      : '';
   const avgTitle = cur !== base && h.avgCost !== undefined ? `${perShare(h.avgCost, base)} per share at trade-date rates` : '';
   const costTitle = cur !== base ? `${money(h.basis, base)} at trade-date rates` : '';
   const returnTitle = priced && cur !== base ? `Price ${pct(h.pricePl! / h.basis)} · FX ${pct(h.fxPl! / h.basis)} (in ${base})` : '';
   const monogram = h.symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 2);

   return `
    <tr>
      <td>
        <div class="sym">
          <span class="mono" aria-hidden="true">${esc(monogram)}</span>
          <div>${
             focused
                ? `<b>${esc(h.symbol)}</b>`
                : `<button type="button" class="sym-link" data-focus="${esc(h.symbol)}"
                  title="View only ${esc(h.symbol)}">${esc(h.symbol)}</button>`
          }${q?.name ? sub(esc(q.name), 'name') : ''}</div>
          ${issue ? `<span class="issue" title="${esc(issue)}">⚠</span>` : ''}
        </div>
      </td>
      <td>${qty(h.shares)}${h.open.length > 1 ? sub(`${h.open.length} lots`) : ''}</td>
      <td title="${esc(priceTitle)}">${
         q && priced
            ? perShare(q.price, cur) + (h.fromHigh !== undefined ? sub(`${pct(h.fromHigh, { digits: 1 })} vs 52w high`) : '')
            : '—'
      }</td>
      <td title="${esc(avgTitle)}">${h.avgCostLocal !== undefined ? perShare(h.avgCostLocal, cur) : '—'}${
         h.avgPriceLocal !== undefined && h.avgPriceLocal !== h.avgCostLocal ? sub(`${perShare(h.avgPriceLocal, cur)} excl. fees`) : ''
      }</td>
      <td title="${esc(costTitle)}">${money(h.basisLocal, cur)}${
         h.feesLocal > 0 ? sub(`incl. ${money(h.feesLocal, cur)} fees`) : ''
      }</td>
      <td><b>${priced ? money(h.valueLocal!, cur) : '—'}</b>${priced ? sub(approx(h.valueLocal!, cur)) : ''}</td>
      <td class="${tone(h.returnPct)}" title="${esc(returnTitle)}"><b>${pct(h.returnPct)}</b>${
         h.annualized !== undefined ? sub(`${pct(h.annualized, { digits: 1 })} p.a.`) : ''
      }</td>
      <td class="${tone(h.dayPct)}">${pct(h.dayPct)}${h.marketOpen === false ? `<span class="badge">closed</span>` : ''}</td>
      <td>${h.dividendsLocal ? money(h.dividendsLocal, cur) : '—'}${
         h.yieldTtm !== undefined ? sub(`${share(h.yieldTtm)} yield`) : ''
      }</td>
      <td>${weightCell(h.weight)}</td>
    </tr>`;
}
