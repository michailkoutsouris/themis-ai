import type { APIRoute } from 'astro';
import { createPromptArchive } from '../lib/prompt-archive';

export const GET: APIRoute = () => new Response(new Uint8Array(createPromptArchive('el')), {
  headers: { 'Content-Type': 'application/zip' },
});
