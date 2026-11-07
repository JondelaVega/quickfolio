const HOUR = 3_600_000;
/** Room an x-axis time label needs, in pixels. */
const TIME_LABEL_PX = 46;

/** Round tick values from at or below `lo` to at or above `hi`, in roughly `count` steps of 1, 2 or 5 × 10ⁿ. */
export function niceTicks(lo: number, hi: number, count = 3): number[] {
   if (!(hi - lo > 1)) {
      lo -= 1;
      hi += 1;
   }

   const raw = (hi - lo) / count;
   const mag = 10 ** Math.floor(Math.log10(raw));
   const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
   // The last tick must reach `hi`, or the line's peak is drawn above the plot.
   const ticks: number[] = [];
   const top = Math.ceil(hi / step) * step;

   for (let v = Math.floor(lo / step) * step; v <= top + step / 2; v += step) {
      ticks.push(v);
   }

   return ticks;
}

/**
 * Evenly spaced levels across the data with a little headroom, for a chart
 * whose amounts are hidden. Round levels (`niceTicks`) would give the scale
 * away: where the lines sit between round gridlines reveals the amounts'
 * leading digits.
 */
export function spanTicks(lo: number, hi: number, count = 3): number[] {
   const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.01 || 1;
   const [a, b] = [lo - pad, hi + pad];

   return Array.from({ length: count + 1 }, (_, i) => a + ((b - a) * i) / count);
}

/** Compact currency labels with just enough decimals that neighbouring ticks never read the same. */
export function tickLabels(ticks: number[], currency: string): string[] {
   for (let digits = 1; ; digits++) {
      const f = new Intl.NumberFormat('en-US', {
         style: 'currency',
         currency,
         notation: 'compact',
         maximumFractionDigits: digits,
      });
      const labels = ticks.map((t) => f.format(t));

      if (new Set(labels).size === labels.length || digits >= 4) {
         return labels;
      }
   }
}

/** Whole local hours inside (t0, t1), thinned to fit and kept clear of the open and close labels. */
export function hourTicks(t0: number, t1: number, px: (t: number) => number): number[] {
   const first = new Date(t0);

   first.setMinutes(0, 0, 0);
   const hours: number[] = [];

   for (let t = first.getTime() + HOUR; t < t1; t += HOUR) {
      hours.push(t);
   }

   const every = [1, 2, 3, 4, 6].find((n) => px(t0 + n * HOUR) - px(t0) >= TIME_LABEL_PX) ?? 6;

   return hours.filter(
      (t) => new Date(t).getHours() % every === 0 && px(t) - px(t0) >= TIME_LABEL_PX && px(t1) - px(t) >= TIME_LABEL_PX,
   );
}
