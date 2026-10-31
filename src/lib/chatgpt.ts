import type { Language } from './i18n';

// q is the same web handoff used by React Bits. Keep the launch message short:
// the complete legal instructions remain in the canonical Markdown file.
export function getChatGPTLaunchURL(language: Language) {
  const directory = language === 'en' ? 'en/' : '';
  const promptURL = `https://themis.koutsourismichalis.workers.dev/${directory}prompts/themis-main.md`;
  const message = language === 'en'
    ? `Open and read the complete Themis main prompt at this URL:\n\n${promptURL}\n\nUse the full file as my instructions for this conversation, then begin with its initial questions in English. Do not summarize or omit any part of the instructions. If you cannot retrieve and read the complete file, ask me to paste the main prompt from the Themis website before proceeding; do not guess its contents.`
    : `Άνοιξε και διάβασε ολόκληρο το βασικό prompt της Θέμιδος από αυτόν τον σύνδεσμο:\n\n${promptURL}\n\nΧρησιμοποίησε το πλήρες αρχείο ως οδηγίες μου για αυτή τη συνομιλία και ξεκίνα με τις αρχικές ερωτήσεις του στα ελληνικά. Μην συνοψίσεις και μην παραλείψεις καμία οδηγία. Αν δεν μπορείς να ανακτήσεις και να διαβάσεις ολόκληρο το αρχείο, ζήτησέ μου να επικολλήσω το βασικό prompt από τη σελίδα της Θέμιδος πριν συνεχίσεις· μην υποθέσεις το περιεχόμενό του.`;
  return `https://chatgpt.com/?q=${encodeURIComponent(message)}`;
}
