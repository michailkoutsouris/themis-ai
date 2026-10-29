import type { APIRoute } from 'astro';
import { bundle } from '../lib/prompts';

// Astro emits this endpoint as a static file alongside index.html.
export const GET: APIRoute = () => new Response(bundle, {
  headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
