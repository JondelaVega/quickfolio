import { REPORTING } from '../../domain/types';
import { esc } from '../dom';
import { time } from '../format';
import type { RenderContext } from './context';

/** Reporting-currency switch, freshness and the refresh button, in the top bar. */
export function renderStatus(el: HTMLElement, { state }: RenderContext): void {
   const { reporting } = state.view;
   const { refreshing } = state.status;
   const { refreshedAt, fxDate } = state.market;

   el.innerHTML = `
    <div class="segmented" role="group" aria-label="Reporting currency">
      ${REPORTING.map(
         (c) =>
            `<button type="button" data-reporting="${c}" class="${c === reporting ? 'selected' : ''}"
            aria-pressed="${c === reporting}">${c}</button>`,
      ).join('')}
    </div>
    <span class="status-text">${
       refreshing ? 'Refreshing…' : refreshedAt ? `Updated ${time(refreshedAt)}` : 'Not refreshed yet'
    }${fxDate ? ` · FX ${esc(fxDate)}` : ''}</span>
    <button type="button" id="refresh" class="btn btn-icon ${refreshing ? 'spinning' : ''}" ${refreshing ? 'disabled' : ''}
      aria-label="Refresh prices" title="Refresh prices">↻</button>
  `;
}
