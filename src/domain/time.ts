export const DAY = 86_400_000;

/** The viewer's local calendar date of an instant, `YYYY-MM-DD` (the sv-SE locale formats it that way). */
export const localDay = (ms: number) => new Date(ms).toLocaleDateString('sv-SE');

/** The viewer's local calendar date now, `YYYY-MM-DD`. */
export const today = () => localDay(Date.now());

/** Midnight UTC at the start of a `YYYY-MM-DD` trade date. */
export const tradeTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
