import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` makes every asset resolve relative to the page URL, so the build
// works both at the repository root and under a GitHub Pages sub-path
// (https://<user>.github.io/<repo>/). No configuration change is required when
// renaming the repository.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    // TensorFlow.js is intentionally large; keep the warning threshold sensible.
    chunkSizeWarningLimit: 1600,
  },
});
