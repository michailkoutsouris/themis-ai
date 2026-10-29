import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  // Keep the page self-contained for offline reading and file:// access.
  build: { inlineStylesheets: 'always' },
});
