import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // Inline the wasm-bindgen glue loader as an ES module import; the .wasm
    // itself is served as a static asset from dist/ by the Cloudflare Worker.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    fs: {
      // Allow Vite's dev server to read the ../wasm/ directory produced by wasm-pack.
      allow: ['..'],
    },
  },
});
