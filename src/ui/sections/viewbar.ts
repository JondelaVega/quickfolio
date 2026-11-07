import type { Holding } from '../../domain/valuation';
import { esc } from '../dom';
import type { RenderContext } from './context';

/** The stock picker above the summary; hidden until there are two stocks to choose between. */
export function renderViewbar(bar: HTMLElement, { full, focused }: RenderContext): void {
   bar.hidden = full.holdings.length < 2;

   if (bar.hidden) {
      return;
   }

   const option = (h: Holding) =>
      `<option value="${esc(h.symbol)}"${h.symbol === focused ? ' selected' : ''}>${esc(h.symbol)}${
         h.quote?.name ? ` · ${esc(h.quote.name)}` : ''
      }</option>`;
   const held = full.holdings.filter((h) => h.shares > 0 || h.issue).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
   const sold = full.holdings.filter((h) => !held.includes(h)).sort((a, b) => a.symbol.localeCompare(b.symbol));

   bar.innerHTML = `
    <label for="focus">View</label>
    <select id="focus">
      <option value="">All holdings</option>
      <optgroup label="Held">${held.map(option).join('')}</optgroup>
      ${sold.length ? `<optgroup label="Sold">${sold.map(option).join('')}</optgroup>` : ''}
    </select>
    ${
       focused
          ? `<button type="button" class="btn btn-sm"
      data-focus="">Show all</button><span class="muted">Cash is left out of a single-stock view.</span>`
          : ''
    }
  `;
}
