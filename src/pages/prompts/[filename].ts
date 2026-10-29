import type { APIRoute, GetStaticPaths } from 'astro';
import { prompts } from '../../lib/prompts';

export const getStaticPaths = (() => prompts.map(prompt => ({
  params: { filename: prompt.filename },
  props: { content: prompt.content },
}))) satisfies GetStaticPaths;

export const GET: APIRoute<{ content: string }> = ({ props }) => new Response(props.content, {
  headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
