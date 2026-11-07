import { realizedByYear } from '../../domain/realized';
import { esc } from '../dom';
import { pct, tone } from '../format';
import { realizedText, sub } from './common';
import type { RenderContext } from './context';

/** Every sale's realized result, newest first, with per-year totals. */
export function renderRealized(section: HTMLElement, { s, fmt }: RenderContext): void {
   const { money, signedMoney, qty } = fmt;

   section.hidden = s.sales.length === 0;

   if (section.hidden) {
      return;
   }

   const cur = s.base;
   const years = Object.entries(realizedByYear(s.sales)).reverse();
   const yearChips = years
      .map(([year, gain]) => {
         const sales = s.sales.filter((x) => x.trade.date.startsWith(year));

         return `<span class="chip"><b>${year}</b> <span class="${tone(gain)}">${realizedText(sales, cur, fmt)}</span></span>`;
      })
      .join('');
   const rows = [...s.sales].reverse().map((sale) => {
      const t = sale.trade;
      const local = t.currency !== cur;
      const first = sale.lots[0]?.buy.date;
      const last = sale.lots[sale.lots.length - 1]?.buy.date;
      const bought = first === undefined ? '' : first === last ? `bought ${first}` : `${sale.lots.length} lots, ${first} → ${last}`;

      return `
      <tr>
        <td>${esc(t.date)}</td>
        <td><b>${esc(t.symbol)}</b></td>
        <td>${qty(t.quantity)}</td>
        <td>${money(sale.proceeds, cur)}${local ? sub(money(sale.proceedsLocal, t.currency)) : ''}</td>
        <td>${money(sale.basis, cur)}${sub(esc(bought))}</td>
        <td class="${tone(sale.gain)}"><b>${signedMoney(sale.gain, cur)}</b>${
           local ? sub(`${signedMoney(sale.gainLocal, t.currency)} in ${esc(t.currency)}`) : ''
        }</td>
        <td class="${tone(sale.returnPct)}">${pct(sale.returnPct)}</td>
      </tr>`;
   });

   section.innerHTML = `
    <div class="card-header"><h2>Realized</h2><span class="muted">FIFO, after fees, at trade-date FX</span></div>
    <div class="chips realized-years"><div class="chip-group"><span class="chip-label">By year</span>${yearChips}</div></div>
    <div class="table-wrap">
      <table class="realized">
        <thead><tr>
          <th>Sold</th><th>Symbol</th><th>Units</th>
          <th title="After selling fees, at the sale-date rate">Proceeds</th>
          <th title="Purchase cost of the shares sold, fees included, oldest purchases first">Cost basis</th>
          <th title="In ${cur}, including the currency effect between purchase and sale">Gain</th><th>Return</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}
