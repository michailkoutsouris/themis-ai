import { transform } from 'esbuild';
import source from '../scripts/page-motion.js?raw';

// Keep the static HTML portable, including direct file:// use.
const result = await transform(source, { minify: true, target: 'es2020', legalComments: 'inline' });
export const pageMotionScript = result.code.replace(/<\/script/gi, '<\\/script');
