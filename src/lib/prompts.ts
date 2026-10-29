import type { Language } from './i18n';

const sourceFiles = import.meta.glob<string>('../content/prompts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const greekDefinitions = [
  { id: 'start', label: 'Εκκίνηση', title: 'Το βασικό prompt', description: 'Επικόλλησέ το πρώτο σε νέα συνομιλία. Η Θέμις θα ξεκινήσει με ερωτήσεις.', filename: 'themis-main.md' },
  { id: 'final', label: 'Πλήρης Έλεγχος', title: 'Έλεγχος πριν από την έκδοση', description: 'Στην ίδια συνομιλία, αφού ολοκληρωθούν η συλλογή στοιχείων και η έρευνα.', filename: 'themis-final-check.md' },
  { id: 'handoff', label: 'Συνέχεια', title: 'Πάρε τον φάκελο μαζί σου', description: 'Στην υπάρχουσα συνομιλία, για εξαγωγή φακέλου πριν μεταβείς σε νέα.', filename: 'themis-handoff.md' },
  { id: 'review', label: 'Δεύτερος έλεγχος', title: 'Μια δεύτερη ανάγνωση', description: 'Σε νέα συνομιλία, μαζί με το σχέδιο, τον φάκελο και τα κρίσιμα αρχεία.', filename: 'themis-review.md' },
] as const;

const englishDefinitions = [
  { id: 'start', label: 'Start', title: 'The main prompt', description: 'Paste this first in a new conversation. Themis will begin with questions.', filename: 'themis-main.md' },
  { id: 'final', label: 'Full Check', title: 'Check before the final version', description: 'Use in the same conversation after gathering the facts and completing the research.', filename: 'themis-final-check.md' },
  { id: 'handoff', label: 'Continue', title: 'Take the case file with you', description: 'Use in the current conversation to export the case file before moving to a new one.', filename: 'themis-handoff.md' },
  { id: 'review', label: 'Second review', title: 'A second reading', description: 'Use in a new conversation, with the draft, case file, and critical documents.', filename: 'themis-review.md' },
] as const;

// Vite embeds both languages at build time; the deployed site needs no filesystem.
export function getPrompts(language: Language) {
  const definitions = language === 'en' ? englishDefinitions : greekDefinitions;
  const directory = language === 'en' ? 'en/' : '';
  const prompts = definitions.map(prompt => {
    const source = sourceFiles[`../content/prompts/${directory}${prompt.filename}`];
    if (source === undefined) throw new Error(`Missing prompt: ${prompt.filename}`);
    return { ...prompt, content: source.trim() + '\n' };
  });

  const greekIntroduction = '# Θέμις — Πακέτο prompts\n\nΈκδοση 1.0 · 29.10.2026 · Ελληνικό δίκαιο\n\n'
    + 'Χρήση: επικόλλησε το βασικό prompt σε νέα συνομιλία ChatGPT, επίλεξε διαθέσιμο ισχυρό reasoning μοντέλο και ζωντανή αναζήτηση. Προτεινόμενο: Astra στο Work, με High όπου προσφέρεται. Η διαθεσιμότητα διαφέρει ανά λογαριασμό. Οι ρόλοι σε απλό chat δεν είναι ανεξάρτητοι subagents. Τα υπόλοιπα prompts χρησιμοποιούνται χωριστά, σύμφωνα με τον τίτλο τους. Μην επικολλήσεις όλο το πακέτο ως μία εντολή.\n\n';

  const englishIntroduction = '# Themis — Prompt bundle\n\nVersion 1.0 · 29 October 2026 · Greek law · English edition\n\n'
    + 'Usage: paste the main prompt into a new ChatGPT conversation, choose an available strong reasoning model and live search. Suggested: Astra in Work, with High where offered. Availability varies by account. Roles in a regular chat are not independent subagents. Use the other prompts separately, as their titles indicate. Do not paste the entire bundle as one instruction.\n\n';
  const bundle = (language === 'en' ? englishIntroduction : greekIntroduction)
    + prompts.map(prompt => prompt.content).join('\n\n---\n\n');
  return { prompts, bundle, archiveFilename: language === 'en' ? 'themis-prompts-en.zip' : 'themis-prompts.zip', bundleFilename: language === 'en' ? 'themis-prompts-en.md' : 'themis-prompts.md' };
}

export type Prompt = ReturnType<typeof getPrompts>['prompts'][number];

// Keep the existing Greek download URLs stable.
export const { prompts, bundle } = getPrompts('el');
