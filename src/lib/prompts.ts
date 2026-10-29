const sourceFiles = import.meta.glob<string>('../content/prompts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const definitions = [
  { id: 'start', label: 'Εκκίνηση', title: 'Το βασικό prompt', description: 'Επικόλλησέ το πρώτο σε νέα συνομιλία. Η Θέμις θα ξεκινήσει με ερωτήσεις.', filename: 'themis-main.md' },
  { id: 'review', label: 'Δεύτερος έλεγχος', title: 'Μια δεύτερη ανάγνωση', description: 'Σε νέα συνομιλία, μαζί με το σχέδιο, τον φάκελο και τα κρίσιμα αρχεία.', filename: 'themis-review.md' },
  { id: 'final', label: 'Πλήρης έκδοση', title: 'Έλεγχος πριν από την έκδοση', description: 'Στην ίδια συνομιλία, αφού ολοκληρωθούν η συλλογή στοιχείων και η έρευνα.', filename: 'themis-final-check.md' },
  { id: 'handoff', label: 'Συνέχεια', title: 'Πάρε τον φάκελο μαζί σου', description: 'Στην υπάρχουσα συνομιλία, για εξαγωγή φακέλου πριν μεταβείς σε νέα.', filename: 'themis-handoff.md' },
] as const;

// Vite embeds the canonical Markdown at build time; no runtime filesystem.
export const prompts = definitions.map(prompt => {
  const source = sourceFiles[`../content/prompts/${prompt.filename}`];
  if (source === undefined) throw new Error(`Missing prompt: ${prompt.filename}`);
  return { ...prompt, content: source.trim() + '\n' };
});

export type Prompt = (typeof prompts)[number];

export const bundle = '# Θέμις — Πακέτο prompts\n\nΈκδοση 1.0 · 29.10.2026 · Ελληνικό δίκαιο\n\n'
  + 'Χρήση: επικόλλησε το βασικό prompt σε νέα συνομιλία ChatGPT, επίλεξε διαθέσιμο ισχυρό reasoning μοντέλο και ζωντανή αναζήτηση. Προτεινόμενο: Astra στο Work, με High όπου προσφέρεται. Η διαθεσιμότητα διαφέρει ανά λογαριασμό. Οι ρόλοι σε απλό chat δεν είναι ανεξάρτητοι subagents. Τα υπόλοιπα prompts χρησιμοποιούνται χωριστά, σύμφωνα με τον τίτλο τους. Μην επικολλήσεις όλο το πακέτο ως μία εντολή.\n\n'
  + prompts.map(prompt => prompt.content).join('\n\n---\n\n');
