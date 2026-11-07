import { html, svgEl } from '../../dom';
import { hourTicks, niceTicks, spanTicks, tickLabels } from './axis';
import { clock } from './labels';
import type { PlotSpec, Point, TrendOptions } from './types';

const HEIGHT = 168;
const PAD = { top: 10, right: 64, bottom: 22, left: 52 };

export function lineKey(cls: string): SVGSVGElement {
   const key = svgEl('svg', { width: 14, height: 8, class: 'line-key', 'aria-hidden': 'true' });

   key.append(svgEl('line', { x1: 1, y1: 4, x2: 13, y2: 4, class: cls }));

   return key;
}

/** The chart itself: axes, both lines, end labels, a hover and keyboard readout, and a table view. */
export function drawPlot(container: HTMLElement, spec: PlotSpec, opts: TrendOptions): void {
   const { points, t0, t1 } = spec;
   const end = points[points.length - 1]!;
   // clientWidth includes the card's padding; the chart gets only the content box.
   const style = getComputedStyle(container);
   const width = Math.max(container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), 280);
   const values = points.flatMap((p) => [p.value, p.ref]);
   const ticks = (opts.hideAmounts ? spanTicks : niceTicks)(Math.min(...values), Math.max(...values));
   const lo = ticks[0]!;
   const hi = Math.max(ticks[ticks.length - 1]!, lo + 1);
   const plotW = width - PAD.left - PAD.right;
   const plotH = HEIGHT - PAD.top - PAD.bottom;
   const xt = (t: number) => PAD.left + (t1 > t0 ? (t - t0) / (t1 - t0) : 1) * plotW;
   const x = (p: Point) => xt(p.t);
   const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

   const svg = svgEl('svg', {
      width,
      height: HEIGHT,
      viewBox: `0 0 ${width} ${HEIGHT}`,
      class: 'trend-chart',
      tabindex: 0,
      role: 'img',
      'aria-label': `${spec.aria} Use arrow keys to step through ${spec.keyStep}.`,
   });

   const labels = tickLabels(ticks, opts.currency);

   ticks.forEach((t, i) => {
      svg.append(svgEl('line', { x1: PAD.left, x2: PAD.left + plotW, y1: y(t), y2: y(t), class: 'trend-grid' }));

      // Gridlines stay so the shape reads; their money labels would reveal the scale.
      if (opts.hideAmounts) {
         return;
      }

      const label = svgEl('text', {
         x: PAD.left - 8,
         y: y(t),
         class: 'trend-axis',
         'text-anchor': 'end',
         'dominant-baseline': 'middle',
      });

      label.textContent = labels[i]!;
      svg.append(label);
   });
   const xLabels = [...spec.xLabels];

   if (spec.ref.flat) {
      for (const t of hourTicks(t0, t1, xt)) {
         xLabels.push({ t, text: clock(t), anchor: 'middle' });
      }
   }

   for (const l of xLabels) {
      const label = svgEl('text', { x: xt(l.t), y: HEIGHT - 6, class: 'trend-axis', 'text-anchor': l.anchor });

      label.textContent = l.text;
      svg.append(label);
   }

   // Cost basis only changes on trade dates, so it is drawn as steps; the previous close spans the whole session.
   const valuePath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
   const refPath = spec.ref.flat
      ? `M${xt(t0).toFixed(1)},${y(end.ref).toFixed(1)}H${xt(t1).toFixed(1)}`
      : points.map((p, i) => (i ? `H${x(p).toFixed(1)}V${y(p.ref).toFixed(1)}` : `M${x(p).toFixed(1)},${y(p.ref).toFixed(1)}`)).join('');
   const crosshair = svgEl('line', { y1: PAD.top, y2: PAD.top + plotH, class: 'trend-crosshair', visibility: 'hidden' });
   const hoverValue = svgEl('circle', { r: 4, class: 'trend-dot trend-value', visibility: 'hidden' });
   const hoverRef = svgEl('circle', { r: 4, class: `trend-dot ${spec.ref.cls}`, visibility: 'hidden' });

   svg.append(
      crosshair,
      svgEl('path', { d: refPath, class: `trend-line ${spec.ref.cls}` }),
      svgEl('path', { d: valuePath, class: 'trend-line trend-value' }),
      svgEl('circle', { cx: x(end), cy: y(end.value), r: 4, class: 'trend-dot trend-value' }),
      hoverRef,
      hoverValue,
   );

   // Direct end labels, dropped when they would collide (the legend covers it).
   const yv = y(end.value);
   const yr = y(end.ref);
   const xr = spec.ref.flat ? xt(t1) : x(end);

   if (Math.abs(yv - yr) >= 14 || xr - x(end) > 80) {
      for (const [xx, yy, text] of [
         [x(end), yv, 'Value'],
         [xr, yr, spec.ref.endLabel],
      ] as const) {
         const label = svgEl('text', { x: xx + 8, y: yy, class: 'trend-end-label', 'dominant-baseline': 'middle' });

         label.textContent = text;
         svg.append(label);
      }
   }

   // Tooltip: one readout listing every series at the hovered point.
   const tooltip = html('div', 'trend-tooltip');

   tooltip.hidden = true;
   const tipTitle = html('div', 'tip-date');
   const tipRows = spec.tipRows.map((r) => {
      const row = html('div', 'tip-row');
      const value = html('strong');

      if (r.cls) {
         row.append(lineKey(r.cls));
      } else {
         row.append(html('span', 'line-key-spacer'));
      }

      row.append(value, html('span', '', r.label));

      return { row, value, get: r.get };
   });

   tooltip.append(tipTitle, ...tipRows.map((r) => r.row));

   const plot = html('div', 'trend-plot');

   plot.append(svg, tooltip);

   let active = points.length - 1;
   const show = (i: number) => {
      active = i;
      const p = points[i]!;
      const px = x(p);

      for (const [el, attrs] of [
         [crosshair, { x1: px, x2: px }],
         [hoverValue, { cx: px, cy: y(p.value) }],
         [hoverRef, { cx: px, cy: y(p.ref) }],
      ] as const) {
         for (const [k, v] of Object.entries(attrs)) {
            el.setAttribute(k, String(v));
         }

         el.setAttribute('visibility', 'visible');
      }

      tipTitle.textContent = spec.pointName(p);

      for (const r of tipRows) {
         r.value.textContent = r.get(p);
      }

      tooltip.hidden = false;
      const left = px + 12 + tooltip.offsetWidth > width ? px - 12 - tooltip.offsetWidth : px + 12;

      tooltip.style.left = `${left}px`;
   };
   const hide = () => {
      for (const el of [crosshair, hoverValue, hoverRef]) {
         el.setAttribute('visibility', 'hidden');
      }

      tooltip.hidden = true;
   };
   // Binary search for the point nearest a pixel column; points are time-sorted.
   const nearest = (px: number) => {
      let a = 0;
      let b = points.length - 1;

      while (b - a > 1) {
         const m = (a + b) >> 1;

         if (x(points[m]!) < px) {
            a = m;
         } else {
            b = m;
         }
      }

      return Math.abs(x(points[a]!) - px) <= Math.abs(x(points[b]!) - px) ? a : b;
   };

   svg.addEventListener('pointermove', (e) => show(nearest(e.clientX - svg.getBoundingClientRect().left)));
   svg.addEventListener('pointerleave', () => document.activeElement !== svg && hide());
   svg.addEventListener('focus', () => show(active));
   svg.addEventListener('blur', hide);
   svg.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 20 : 1;

      if (e.key === 'ArrowLeft') {
         show(Math.max(active - step, 0));
      } else if (e.key === 'ArrowRight') {
         show(Math.min(active + step, points.length - 1));
      } else {
         return;
      }

      e.preventDefault();
   });

   // Table view, so every value is reachable without hovering.
   const table = html('details', 'trend-table');

   table.append(html('summary', '', spec.table.summary));
   const t = html('table');
   const head = t.createTHead().insertRow();

   for (const h of spec.table.head) {
      head.append(html('th', '', h));
   }

   const body = t.createTBody();
   const rows = points.filter((p, i) => spec.table.keep(p, points[i + 1]));

   for (const p of rows.reverse()) {
      const row = body.insertRow();

      for (const v of spec.table.cells(p)) {
         row.insertCell().textContent = v;
      }
   }

   table.append(t);

   container.append(plot, table);
}
