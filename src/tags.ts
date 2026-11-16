import { parseBibInput } from './bib-input';
import { convertBib, serialize, type Conversion } from './formatter';

export function tagCandidates(query: URLSearchParams): string[] {
  return [...new Set(query.getAll('tags').map(tag => tag.trim()).filter(Boolean))];
}

export function entryTags(value: string): string[] {
  const escapes: Record<string, string> = { 'textbackslash{}': '\\', 'textasciitilde{}': '~', 'textasciicircum{}': '^' };
  return value.split(',').map(tag => tag.trim().replace(/\\(textbackslash\{\}|textasciitilde\{\}|textasciicircum\{\}|[{}&%$#_])/g, (_, escaped: string): string => escapes[escaped] ?? escaped)).filter(Boolean);
}

export function addEntryTag(input: string, candidate: string): Conversion {
  const tag = candidate.trim();
  if (!tag) throw new Error('空のタグは追加できません。');
  if (tag.includes(',')) throw new Error('カンマを含むタグは、カンマ区切りの _tags に追加できません。');
  const library = parseBibInput(input);
  if (library.errors.length || library.entries.length !== 1) throw new Error('タグの追加は正しい bib が1件のときに使えます。');
  const entry = library.entries[0]!;
  const existing = entry.fields._tags ?? '';
  if (entryTags(existing).includes(tag)) return { ...convertBib(input, { generateKeys: false }), bib: input };
  // Escape structural BibTeX characters, preserving literal spaces and ordinary punctuation.
  const escaped = tag.replace(/[\\{}]/g, character => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}' })[character]!);
  entry.fields._tags = existing.trim() ? `${existing.trim()}, ${escaped}` : escaped;
  const preambles = library.preambles.map(value => `@preamble{${value}}`);
  const bib = [...preambles, serialize(entry)].join('\n\n') + '\n';
  return { ...convertBib(bib, { generateKeys: false }), bib };
}
