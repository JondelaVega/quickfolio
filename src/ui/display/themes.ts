// Selectable looks. A theme's styles live in styles/themes/<key>.css, scoped to html[data-theme='<key>'];
// adding one means a file there plus an entry here. "modern" is the base stylesheet itself.

/**
 * The swatch is a miniature drawn with literal colours, since a theme's
 * tokens only exist while it is applied: page, card, accent, and the chart's
 * value line.
 */
export const THEMES = [
   { key: 'modern', label: 'Modern', swatch: ['#f4f5f7', '#ffffff', '#14161a', '#2a78d6'] },
   { key: 'broadsheet', label: 'Broadsheet', swatch: ['#fff1e5', '#fff7ef', '#990f3d', '#0f8ba0'] },
   { key: 'terminal', label: 'Terminal', swatch: ['#000000', '#0b0b0b', '#ffb000', '#4b8fe0'] },
   { key: 'neon', label: 'Neon', swatch: ['#2a0b4a', '#1c1233', '#f0abfc', '#22d3ee'] },
   { key: 'brutalist', label: 'Brutalist', swatch: ['#ffd400', '#ffffff', '#000000', '#1f4fff'] },
   { key: 'zen', label: 'Zen', swatch: ['#fbfaf7', '#fbfaf7', '#5b7f6a', '#3a6cb8'] },
] as const;
export type ThemeKey = (typeof THEMES)[number]['key'];

/** How the holdings table is laid out; `cards` is CSS-only (styles/layouts/cards.css). */
export const LAYOUTS = ['table', 'cards'] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface Display {
   theme: ThemeKey;
   layout: Layout;
}

/** A stored choice, or the default when it is missing or no longer offered. */
export const initialDisplay = (stored: { theme?: string; layout?: string }): Display => ({
   theme: THEMES.find((t) => t.key === stored.theme)?.key ?? 'modern',
   layout: LAYOUTS.find((l) => l === stored.layout) ?? 'table',
});
