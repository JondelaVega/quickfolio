import { PAGE_SIZES, updateView, type AppStore, type PageSize } from '../../app/state';
import type { Trade } from '../../domain/types';
import { esc } from '../dom';
import { tone } from '../format';
import type { RenderContext } from './context';

export interface TransactionsSection {
   render(ctx: RenderContext): void;
}

/**
 * The ledger, newest first, with edit and delete buttons (wired by the trade form); narrowed to the focused stock
 * and shown a page at a time. The page is this section's own: it goes back to the first whenever the focus or the
 * page size changes, and stays in range when trades are deleted.
 */
export function mountTransactions(el: HTMLElement, store: AppStore): TransactionsSection {
   let page = 0;
   /** The focus and page size the current page belongs to. */
   let pageOf = '';
   let latest: RenderContext | undefined;

   el.addEventListener('click', (event) => {
      const step = (event.target as HTMLElement).closest<HTMLElement>('[data-page]')?.dataset.page;

      if (step && latest) {
         page += step === 'next' ? 1 : -1;
         render(latest);
      }
   });
   el.addEventListener('change', (event) => {
      const target = event.target as HTMLSelectElement;

      if (target.name === 'page-size') {
         updateView(store, { pageSize: Number(target.value) as PageSize });
      }
   });

   function render(ctx: RenderContext): void {
      latest = ctx;
      const { pageSize } = ctx.state.view;
      const key = `${ctx.focused ?? ''}|${pageSize}`;

      if (key !== pageOf) {
         pageOf = key;
         page = 0;
      }

      const all = ctx.state.portfolio.trades
         .filter((t) => !ctx.focused || t.symbol === ctx.focused)
         .sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));

      page = Math.min(Math.max(page, 0), Math.max(Math.ceil(all.length / pageSize) - 1, 0));
      const start = page * pageSize;

      renderLedger(el, ctx, all.slice(start, start + pageSize), pager(start, pageSize, all.length));
   }

   return { render };
}

/** "11–20 of 37", the page buttons and the page-size choice; nothing when every list size fits on the smallest page. */
function pager(start: number, size: number, count: number): string {
   if (count <= PAGE_SIZES[0]) {
      return '';
   }

   const end = Math.min(start + size, count);
   const options = PAGE_SIZES.map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n}</option>`).join('');

   return `
    <div class="pager">
      <span class="muted">${start + 1}–${end} of ${count}</span>
      <button type="button" class="btn btn-sm" data-page="prev"${start === 0 ? ' disabled' : ''}>‹ Newer</button>
      <button type="button" class="btn btn-sm" data-page="next"${end === count ? ' disabled' : ''}>Older ›</button>
      <label>Per page <select name="page-size">${options}</select></label>
    </div>`;
}

/** Renders one page of the ledger, `trades`, with the pager's markup under it. */
function renderLedger(el: HTMLElement, { state, s, focused, fmt }: RenderContext, trades: Trade[], pagerHtml: string): void {
   const { money, signedMoney, perShare, qty } = fmt;
   const { portfolio } = state;

   if (portfolio.trades.length === 0) {
      el.innerHTML = '';

      return;
   }

   const sales = new Map(s.sales.map((x) => [x.trade.id, x]));

   el.innerHTML = `
    <h3 class="section-title">Transactions${focused ? ` · ${esc(focused)}` : ''}</h3>
    <div class="table-wrap">
      <table class="lots">
        <thead><tr>
          <th>Date</th><th>Type</th><th>Symbol</th><th>Units</th><th>Price</th>
          <th title="Units × price, or the settled amount when it was in the same currency">Amount</th>
          <th title="Paid for a purchase, received for a sale; before fees">Settled</th><th>Fees</th>
          <th title="USD per 1 EUR on the trade date: implied by the amounts when they convert EUR↔USD, otherwise ECB">EUR/USD</th>
          <th title="Realized gain of a sale, in ${s.base}">Realized</th><th></th>
        </tr></thead>
        <tbody>
          ${trades
             .map((t) => {
                const sale = sales.get(t.id);
                const noun = t.side === 'buy' ? 'purchase' : 'sale';

                return `
            <tr>
              <td>${esc(t.date)}</td>
              <td><span class="side-tag ${t.side}">${t.side === 'buy' ? 'Buy' : 'Sell'}</span></td>
              <td><b>${esc(t.symbol)}</b></td>
              <td>${qty(t.quantity)}</td>
              <td>${perShare(t.unitPrice, t.currency)}</td>
              <td>${money(t.gross, t.currency)}</td>
              <td>${money(t.settled, t.settledIn)}</td>
              <td>${money(t.fees, t.feeCurrency)}</td>
              <td
                title="${t.currency !== 'USD' && t.currency !== 'EUR' ? `USD per 1 ${esc(t.currency)}: ${t.fxRate.toFixed(4)}` : ''}">${
                   t.eurUsd !== undefined ? t.eurUsd.toFixed(4) : '<span class="muted">pending</span>'
                }</td>
              <td class="${tone(sale?.gain)}">${sale ? signedMoney(sale.gain, s.base) : t.side === 'sell' ? '—' : ''}</td>
              <td class="row-actions">
                <button type="button" class="btn btn-sm" data-edit="${esc(t.id)}">Edit</button>
                <button type="button" class="btn btn-sm btn-danger" data-delete="${esc(t.id)}" aria-label="Delete ${noun}">✕</button>
              </td>
            </tr>`;
             })
             .join('')}
        </tbody>
      </table>
    </div>
    ${pagerHtml}`;
}
