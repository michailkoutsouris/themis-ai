import { strToU8, zipSync } from 'fflate';
import { getPrompts } from './prompts';
import type { Language } from './i18n';

// Runs only at build time. Each entry is the same canonical text shown/copied in the UI.
export function createPromptArchive(language: Language) {
  const { prompts } = getPrompts(language);
  const files = Object.fromEntries(prompts.map(prompt => [prompt.filename, strToU8(prompt.content)]));
  return zipSync(files, { level: 6, mtime: new Date(2026, 9, 29) });
}
