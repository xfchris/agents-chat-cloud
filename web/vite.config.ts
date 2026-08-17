import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El root del build es `web/`; el bundle sale a `dist/client` (raíz del repo) para
// que el binding [assets] de wrangler lo sirva como SPA (ver wrangler.toml).
const webRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = fileURLToPath(new URL('../dist/client', import.meta.url));
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

// En dev el Worker corre aparte (`wrangler dev`, :8787). Solo los subpaths de
// API/WS de una sala se proxyan allí; `/r/<sala>` pelada la sirve Vite (SPA) para
// no perder HMR. La clave `^…` se interpreta como RegExp (http-proxy).
const WRANGLER_DEV = 'http://127.0.0.1:8787';
const ROOM_API_PROXY = '^/r/[^/]+/(ws|brief|messages|presence)';

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  resolve: {
    alias: {
      shared: sharedDir,
    },
  },
  server: {
    proxy: {
      [ROOM_API_PROXY]: {
        target: WRANGLER_DEV,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
});
