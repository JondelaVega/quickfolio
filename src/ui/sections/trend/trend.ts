import type { RangeKey } from '../../../domain/ranges';
import { buildHistory, type HistoryPoint } from '../../../domain/history';
import { buildDay, type DayCurve } from '../../../domain/intraday';
import { RANGES } from '../../../domain/ranges';
import { localDay, today } from '../../../domain/time';
import { html } from '../../dom';
import { pct } from '../../format';
import type { RenderContext } from '../context';
import { onCost, weekdayDate } from './labels';
import { drawPlot, lineKey } from './plot';
import { daySpec, historySpec } from './specs';
import type { TrendOptions } from './types';

/** The performance card for what the dashboard shows; empty without trades. */
export function renderTrendSection(el: HTMLElement, { state, s, fmt }: RenderContext, onRange: (range: RangeKey) => void): void {
   const { portfolio, market, view } = state;

   if (portfolio.trades.length === 0) {
      el.replaceChildren();

      return;
   }

   // Same holdings as the summary, so the line ends exactly on its figures.
   // Sold-out holdings without a quote have no closes to rebuild their past from.
   const included = s.holdings.filter((h) => !h.issue && h.quote);
   const history = buildHistory(
      included.flatMap((h) => h.positions),
      market.quotes,
      market.fxHistory ?? {},
      today(),
      { value: s.invested, cost: s.costBasis },
      s.base,
      market.fx[s.base] ? 1 / market.fx[s.base]! : 1,
   );
   const day = buildDay(included, market.intraday ?? {}, market.fx, s.base, s.day, Date.now(), s.invested);

   renderTrend(el, history, day, {
      range: view.range,
      onRange,
      currency: s.base,
      money: (v) => fmt.money(v, s.base, 0),
      signedMoney: (v) => fmt.signedMoney(v, s.base, 0),
      pct: (v) => pct(v),
      hideAmounts: fmt.hidden,
   });
}

/**
 * Draws holdings value against a reference over time. Over days and longer
 * the reference is cost basis: the gap is unrealized P/L, and purchases lift
 * both lines together so new money never reads as a gain. Over one day it is
 * the value at the previous close, across the whole session to the close.
 */
function renderTrend(container: HTMLElement, history: HistoryPoint[], day: DayCurve | undefined, opts: TrendOptions): void {
   container.replaceChildren();
   const intraday = opts.range === '1D';

   // Card header: title left, range presets right (the one filter row above the chart).
   const header = html('div', 'card-header');

   header.append(html('h2', '', 'Performance'));
   const ranges = html('div', 'segmented');

   ranges.setAttribute('role', 'group');
   ranges.setAttribute('aria-label', 'Time range');

   for (const r of RANGES) {
      const b = html('button', r.key === opts.range ? 'selected' : '', r.key);

      b.type = 'button';
      b.setAttribute('aria-pressed', String(r.key === opts.range));
      b.addEventListener('click', () => opts.onRange(r.key));
      ranges.append(b);
   }

   header.append(ranges);
   const meta = html('div', 'trend-meta');

   container.append(header, meta);

   const spec = intraday ? daySpec(day, opts) : historySpec(history, opts);
   const legend = html('div', 'trend-legend');

   for (const [cls, label] of [
      ['trend-value', 'Holdings value'],
      [intraday ? 'trend-ref' : 'trend-cost', intraday ? 'Previous close' : 'Cost basis'],
   ] as const) {
      const item = html('span');

      item.append(lineKey(cls), document.createTextNode(label));
      legend.append(item);
   }

   meta.append(legend);

   if (!spec) {
      const note = intraday
         ? 'Intraday prices appear after a refresh on a trading day.'
         : 'History appears once a holding has at least one past daily close.';

      container.append(html('p', 'trend-note', note));

      return;
   }

   const first = spec.points[0]!;
   const end = spec.points[spec.points.length - 1]!;

   const delta = html('div', 'trend-delta');

   if (intraday) {
      const change = end.value - end.ref;
      const label = day!.day === localDay(Date.now()) ? 'Today' : weekdayDate(day!.day);

      delta.append(
         document.createTextNode(`${label}: `),
         html(
            'span',
            change >= 0 ? 'pos' : 'neg',
            opts.hideAmounts ? opts.pct(onCost(end)) : `${opts.signedMoney(change)} · ${opts.pct(onCost(end))}`,
         ),
      );
      delta.title = 'Holdings value against the previous close, at the day’s FX rate. Exchanges that have not opened yet are flat.';
   } else if (opts.hideAmounts) {
      const [a, b] = [onCost(first), onCost(end)];

      delta.append(
         document.createTextNode(`Return on cost since ${spec.pointName(first)}: ${opts.pct(a)} → `),
         html('span', (b ?? 0) >= (a ?? 0) ? 'pos' : 'neg', opts.pct(b)),
      );
      delta.title = 'Unrealized return on the cost of the shares held at each point.';
   } else {
      const dValue = end.value - first.value;
      const dPl = end.value - end.ref - (first.value - first.ref);

      delta.append(
         document.createTextNode(`Since ${spec.pointName(first)}: value `),
         html('span', dValue >= 0 ? 'pos' : 'neg', opts.signedMoney(dValue)),
         document.createTextNode(' · P/L '),
         html('span', dPl >= 0 ? 'pos' : 'neg', opts.signedMoney(dPl)),
      );
      delta.title = 'Value change includes purchases and sales in the period; P/L change is market movement only.';
   }

   meta.append(delta);

   drawPlot(container, spec, opts);
}
