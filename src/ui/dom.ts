const SVG = 'http://www.w3.org/2000/svg';

/** The element matching `selector`; the page shell in index.html guarantees it exists. */
export const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

/** The form's control named `name`; the page shell in index.html guarantees it exists. */
export const field = <T extends HTMLInputElement | HTMLSelectElement = HTMLInputElement>(form: HTMLFormElement, name: string) =>
   form.elements.namedItem(name) as T;

/** Escapes text for interpolation into HTML markup and attribute values. */
export const esc = (s: string) =>
   s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
   const el = document.createElementNS(SVG, tag);

   for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
   }

   return el;
};

export const html = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
   const el = document.createElement(tag);

   if (className) {
      el.className = className;
   }

   if (text) {
      el.textContent = text;
   }

   return el;
};
