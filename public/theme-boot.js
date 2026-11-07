// Applied before first paint, so a chosen theme never flashes the default. main.ts validates the values.
// A file rather than an inline script, so the content security policy can forbid inline scripts outright.
try {
   document.documentElement.dataset.theme = localStorage.getItem('quickfolio:theme') || 'modern';
   document.documentElement.dataset.layout = localStorage.getItem('quickfolio:layout') || 'table';
} catch {}
