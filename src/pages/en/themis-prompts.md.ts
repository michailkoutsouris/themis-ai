import type { APIRoute } from 'astro';
import { getPrompts } from '../../lib/prompts';

export const GET: APIRoute = () => new Response(getPrompts('en').bundle, {
  headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
