import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app's stylesheet would normally block the very first paint, so iPhone shows its own
// blank (white-ish) web view for a frame before the splash appears. Load it without blocking;
// the splash in index.html waits for it before revealing the app.
function nonBlockingCss() {
  return {
    name: 'non-blocking-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<link rel="stylesheet"([^>]*?)href="([^"]+\.css)"([^>]*)>/g,
          (m, a, href, b) =>
            `<link rel="stylesheet"${a}href="${href}"${b} media="print" data-app-css onload="this.media='all';window.__sweatrCssReady&&window.__sweatrCssReady()">`
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), nonBlockingCss()],
});
