import { build } from 'esbuild';
import source from '../scripts/pattern-waves.js?raw';

// This runs only while Astro generates its static HTML, never in the Worker.
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'pattern-waves.js' },
  bundle: true,
  write: false,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  legalComments: 'inline',
});

export const heroBackgroundScript = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
