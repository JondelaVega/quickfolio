import { allocationSlices, type Slice } from '../../domain/allocation';
import { svgEl } from '../dom';
import { share } from '../format';
import type { RenderContext } from './context';

const SIZE = 176;
const OUTER = 84;
const INNER = 58;

/** Annular sector from angle a0 to a1 (radians, clockwise from 12 o'clock). */
function sector(a0: number, a1: number): string {
   const c = SIZE / 2;
   const pt = (r: number, a: number) => `${(c + r * Math.sin(a)).toFixed(2)},${(c - r * Math.cos(a)).toFixed(2)}`;
   const large = a1 - a0 > Math.PI ? 1 : 0;

   const outerArc = `M${pt(OUTER, a0)}A${OUTER},${OUTER} 0 ${large} 1 ${pt(OUTER, a1)}`;
   const innerArc = `L${pt(INNER, a1)}A${INNER},${INNER} 0 ${large} 0 ${pt(INNER, a0)}Z`;

   return outerArc + innerArc;
}

const colorClass = (s: Slice) => (s.slot === undefined ? 'cat-other' : `cat-${s.slot + 1}`);

/**
 * Draws the allocation ring with a legend that carries every label and value,
 * so nothing depends on hovering or on telling colors apart.
 */
function renderAllocation(container: HTMLElement, slices: Slice[], money: (v: number) => string, share: (v: number) => string): void {
   container.replaceChildren();
   const header = document.createElement('div');

   header.className = 'card-header';
   const title = document.createElement('h2');

   title.textContent = 'Allocation';
   const subtitle = document.createElement('span');

   subtitle.className = 'muted';
   subtitle.textContent = 'investments only';
   header.append(title, subtitle);
   container.append(header);

   if (slices.length === 0) {
      const note = document.createElement('p');

      note.className = 'trend-note';
      note.textContent = 'Appears once a holding has a price.';
      container.append(note);

      return;
   }

   const total = slices.reduce((s, x) => s + x.value, 0);
   const body = document.createElement('div');

   body.className = 'alloc';

   const figure = document.createElement('div');

   figure.className = 'alloc-ring';
   const svg = svgEl('svg', { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}`, role: 'img' });

   svg.setAttribute('aria-label', `Allocation of invested value: ${slices.map((s) => `${s.symbol} ${share(s.share)}`).join(', ')}`);

   const center = document.createElement('div');

   center.className = 'alloc-center';
   const centerLabel = document.createElement('span');
   const centerValue = document.createElement('strong');
   const centerSub = document.createElement('span');

   center.append(centerLabel, centerValue, centerSub);

   const showTotal = () => {
      centerLabel.textContent = 'Invested';
      centerValue.textContent = money(total);
      centerSub.textContent = `${slices.length} segment${slices.length === 1 ? '' : 's'}`;
   };
   const showSlice = (s: Slice) => {
      centerLabel.textContent = s.symbol;
      centerValue.textContent = share(s.share);
      centerSub.textContent = money(s.value);
   };

   showTotal();

   const marks: { slice: Slice; els: Element[] }[] = slices.map((s) => ({ slice: s, els: [] }));
   const highlight = (target: Slice | undefined) => {
      for (const m of marks) {
         for (const el of m.els) {
            el.classList.toggle('dim', target !== undefined && m.slice !== target);
         }
      }

      if (target) {
         showSlice(target);
      } else {
         showTotal();
      }
   };

   let angle = 0;

   slices.forEach((s, i) => {
      const sweep = s.share * Math.PI * 2;
      // A single slice is a full ring; an arc path cannot close on itself.
      const seg =
         slices.length === 1
            ? svgEl('circle', {
                 cx: SIZE / 2,
                 cy: SIZE / 2,
                 r: (OUTER + INNER) / 2,
                 class: `alloc-full ${colorClass(s)}`,
                 'stroke-width': OUTER - INNER,
              })
            : svgEl('path', { d: sector(angle, angle + sweep), class: `alloc-seg ${colorClass(s)}` });

      seg.setAttribute('tabindex', '0');
      seg.setAttribute('aria-label', `${s.symbol}: ${share(s.share)}, ${money(s.value)}`);
      seg.addEventListener('pointerenter', () => highlight(s));
      seg.addEventListener('pointerleave', () => highlight(undefined));
      seg.addEventListener('focus', () => highlight(s));
      seg.addEventListener('blur', () => highlight(undefined));
      marks[i]!.els.push(seg);
      svg.append(seg);
      angle += sweep;
   });
   figure.append(svg, center);

   // Legend: in ring order, so largest first and "Other" last; swatches mirror the filled marks.
   const legend = document.createElement('ul');

   legend.className = 'alloc-legend';

   slices.forEach((s, i) => {
      const li = document.createElement('li');
      const swatch = document.createElement('span');

      swatch.className = `swatch ${colorClass(s)}`;
      const label = document.createElement('span');

      label.className = 'alloc-label';
      label.textContent = s.folded ? `Other (${s.folded})` : s.symbol;

      if (s.name) {
         label.title = s.name;
      }

      const pct = document.createElement('b');

      pct.textContent = share(s.share);
      const value = document.createElement('span');

      value.className = 'muted';
      value.textContent = money(s.value);
      li.append(swatch, label, pct, value);
      li.addEventListener('pointerenter', () => highlight(s));
      li.addEventListener('pointerleave', () => highlight(undefined));
      marks[i]!.els.push(li);
      legend.append(li);
   });

   body.append(figure, legend);
   container.append(body);
}

/** The allocation card; hidden for a single stock, which is always the whole ring, and without holdings. */
export function renderAllocationSection(section: HTMLElement, { s, focused, fmt }: RenderContext): void {
   section.hidden = focused !== undefined || !s.holdings.some((h) => h.shares > 0);

   if (section.hidden) {
      return;
   }

   renderAllocation(section, allocationSlices(s.holdings), (v) => fmt.money(v, s.base, 0), share);
}
