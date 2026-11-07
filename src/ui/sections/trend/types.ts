import type { RangeKey } from '../../../domain/ranges';

export interface TrendOptions {
   range: RangeKey;
   onRange: (range: RangeKey) => void;
   /** Currency the points are in; labels the axis. */
   currency: string;
   money: (v: number) => string;
   signedMoney: (v: number) => string;
   pct: (v: number | undefined) => string;
   /** Show no amounts: no money axis, and returns in % wherever the chart would print money. */
   hideAmounts: boolean;
}

export interface Point {
   t: number;
   value: number;
   /** The comparison series: cost basis, or the value at the previous close. */
   ref: number;
   live?: boolean;
}

/** Everything that differs between the daily-history plot and the one-day plot. */
export interface PlotSpec {
   points: Point[];
   /** X domain, epoch ms; `t1` may lie beyond the last point. */
   t0: number;
   t1: number;
   ref: { cls: string; label: string; endLabel: string; flat: boolean };
   xLabels: { t: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
   pointName: (p: Point) => string;
   tipRows: { cls: string; label: string; get: (p: Point) => string }[];
   aria: string;
   keyStep: string;
   table: {
      summary: string;
      head: string[];
      keep: (p: Point, next: Point | undefined) => boolean;
      cells: (p: Point) => string[];
   };
}
