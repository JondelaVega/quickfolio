import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

// Cookies are scoped by host, not port, so the page's requests carry cookies set by any other app on
// localhost (a notebook's login, a dashboard's session). They and the page's address are none of the
// price sources' business: they are removed before a request leaves the machine.
const PRIVATE_HEADERS = ['cookie', 'authorization', 'referer', 'origin'];

// Responses come back on the app's own origin, where a page could read the portfolio. Whatever the
// source sends, it is served as inert data: labelled JSON (never HTML), not sniffed, with a policy
// that forbids running anything, and without cookies the browser would set on localhost.
const INERT_RESPONSE = {
   'content-type': 'application/json; charset=utf-8',
   'x-content-type-options': 'nosniff',
   'content-security-policy': "default-src 'none'; sandbox",
};

const isolateUpstream: ProxyOptions['configure'] = (proxy) => {
   proxy.on('proxyReq', (proxyReq) => {
      for (const header of PRIVATE_HEADERS) {
         proxyReq.removeHeader(header);
      }
   });
   proxy.on('proxyRes', (proxyRes) => {
      delete proxyRes.headers['set-cookie'];
      Object.assign(proxyRes.headers, INERT_RESPONSE);
   });
};

// Yahoo Finance and Frankfurter are called through the local server so the
// browser never makes a cross-origin request (Yahoo sends no CORS headers).
const proxy: Record<string, ProxyOptions> = {
   '/api/yahoo': {
      target: 'https://query1.finance.yahoo.com',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
      headers: { 'User-Agent': 'Mozilla/5.0' },
      configure: isolateUpstream,
   },
   '/api/fx': {
      target: 'https://api.frankfurter.dev',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/fx/, ''),
      configure: isolateUpstream,
   },
};

// No other site may show the app in a frame, where it could be clicked without the user knowing.
// frame-ancestors only works as a header, not in index.html's <meta> policy, so the server sends it.
const headers = {
   'Content-Security-Policy': "frame-ancestors 'none'",
   'X-Frame-Options': 'DENY',
};

// Holdings live in the browser's localStorage, which is scoped to origin
// (host + port). Dev and preview share one fixed port, and fail instead of
// silently moving, so the portfolio is always found where it was saved.
// It is deliberately not a tool's default (Vite's is 5173): any project
// served on the same port would share the storage, and could read the portfolio.
const port = 41753;

// index.html carries the built app's content security policy. The dev server needs two things more: its
// hot-reload socket, and the worker its client starts from a blob: URL to wait for a restarted server (without
// it, the page never reloads itself after a restart). They are added only while it runs.
const BUILT_POLICY = "connect-src 'self';";
const DEV_POLICY = `connect-src 'self' ws://localhost:${port}; worker-src blob:;`;

export function devPolicy(html: string): string {
   if (!html.includes(BUILT_POLICY)) {
      throw new Error(`index.html's content security policy no longer contains "${BUILT_POLICY}"; update vite.config.ts`);
   }

   return html.replace(BUILT_POLICY, DEV_POLICY);
}

const devOnlyPolicy: Plugin = { name: 'quickfolio:dev-policy', apply: 'serve', transformIndexHtml: devPolicy };

export default defineConfig({
   plugins: [devOnlyPolicy],
   server: { proxy, port, strictPort: true, headers },
   preview: { proxy, port, strictPort: true, headers },
});
