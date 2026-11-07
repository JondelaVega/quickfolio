/** Time windows the performance chart can show; `1D` is the latest session, intraday. */
export const RANGES = [
   { key: '1D', days: 1 },
   { key: '1W', days: 7 },
   { key: '1M', days: 31 },
   { key: '1Y', days: 365 },
   { key: '5Y', days: 1826 },
   { key: 'All', days: Infinity },
] as const;
export type RangeKey = (typeof RANGES)[number]['key'];
