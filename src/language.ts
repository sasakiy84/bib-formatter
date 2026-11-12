import { parseVerbatim } from '@retorquere/bibtex-parser/js';

// Prefer explicit metadata, then use the first entry's title rather than its authors' names.
export function detectBibLanguage(input: string): string | undefined {
  const library = parseVerbatim(input);
  if (library.errors.length) return undefined;
  const entry = library.entries[0];
  if (!entry) return undefined;
  const declared = (entry.fields.language || entry.fields.langid || '').trim().toLowerCase();
  if (/^(?:ja|jpn|japanese|日本語)(?:-|$)/u.test(declared)) return 'japanese';
  if (/^(?:en|eng|english|american|british|英語)(?:-|$)/u.test(declared)) return 'english';
  if (declared && /^[\p{L}\p{M} -]+$/u.test(declared)) return declared === 'other' ? '' : declared;
  for (const field of ['title', 'booktitle', 'journaltitle', 'author']) {
    const text = (entry.fields[field] ?? '').replace(/\\[a-z]+/gi, '');
    if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)) return 'japanese';
    const letters = text.match(/\p{L}/gu) ?? [];
    if (letters.length) return letters.every(letter => /\p{Script=Latin}/u.test(letter)) ? 'english' : '';
  }
  return undefined;
}
