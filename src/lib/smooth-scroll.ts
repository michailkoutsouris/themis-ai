import { build } from 'esbuild';
import source from '../scripts/smooth-scroll.js?raw';

// Bundle locally so the static pages keep working offline.
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'smooth-scroll.js' },
  bundle: true,
  write: false,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  legalComments: 'inline',
});
export const smoothScrollScript = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
