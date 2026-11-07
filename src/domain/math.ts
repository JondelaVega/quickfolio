export const sum = <T>(items: T[], f: (item: T) => number) => items.reduce((s, x) => s + f(x), 0);

/** `num / den`, or undefined when there is nothing to divide by. */
export const ratio = (num: number, den: number) => (den !== 0 ? num / den : undefined);
