import { tradeTime } from '../../../domain/time';

/** Midnight UTC of a `YYYY-MM-DD` date: where a daily point sits on the time axis. */
export const dayMs = tradeTime;
export const shortDate = (date: string) =>
   new Date(dayMs(date)).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
   });
/** Unrealized return on cost at a point, the hidden-amounts stand-in for P/L. */
export const onCost = (p: { value: number; ref: number }) => (p.ref ? (p.value - p.ref) / p.ref : undefined);
export const weekdayDate = (date: string) =>
   new Date(dayMs(date)).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
   });
export const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
