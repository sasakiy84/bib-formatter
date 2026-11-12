import { canonicalFieldName, excludedFields, getFieldActions, supportedFields } from './field-actions';
import { japaneseAuthorList } from './authors';
import { parse, parseVerbatim, type VerbatimEntry, type Creator } from '@retorquere/bibtex-parser/js';

const fieldOrder = `author editor translator title subtitle titleaddon shorttitle maintitle mainsubtitle bookauthor booktitle booksubtitle booktitleaddon journaltitle journalsubtitle issuetitle issuesubtitle date eventdate origdate urldate edition volume part volumes number issue series chapter pages pagetotal eid publisher institution organization eventtitle eventtitleaddon venue version type howpublished doi url eprint eprinttype eprintclass isbn issn isrn language langid entrysubtype pubstate options label shorthand sortkey sortname sorttitle sortyear year month day`.split(' ');
const retained = new Set([...fieldOrder, ...supportedFields]);
const typeAliases: Record<string, string> = { conference: 'inproceedings', techreport: 'report', phdthesis: 'thesis', mastersthesis: 'thesis', electronic: 'online', www: 'online' };


export interface FormattedEntry {
  key: string;
  type: string;
  fields: Record<string, string>;
  filename: string;
  removed: string[];
}
export interface Conversion { bib: string; entries: FormattedEntry[]; warnings: string[] }

const nameFields = new Set(['author', 'editor', 'translator', 'bookauthor', 'editora', 'editorb', 'editorc', 'shortauthor', 'shorteditor', 'annotator', 'commentator', 'introduction', 'foreword', 'afterword', 'namea', 'nameb', 'namec', 'sortname']);
function formatNames(value: string): string {
  const names: string[] = [];
  let depth = 0, start = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '\\') { index++; continue; }
    if (character === '{') depth++;
    else if (character === '}') depth--;
    if (depth || !/\s/.test(character ?? '')) continue;
    const separator = value.slice(index).match(/^\s+and\s+/i);
    if (!separator) continue;
    names.push(value.slice(start, index).replace(/\s+/g, ' ').trim());
    index += separator[0].length - 1;
    start = index + 1;
  }
  names.push(value.slice(start).replace(/\s+/g, ' ').trim());
  return names.filter(name => !/^others$/i.test(name)).length <= 10
    ? names.join(' and ')
    : `\n    ${names.join('\n    and ')}\n  `;
}

export function serialize(entry: Pick<VerbatimEntry, 'type' | 'key' | 'fields'>): string {
  const names = Object.keys(entry.fields).sort((a, b) => {
    const ai = fieldOrder.indexOf(a), bi = fieldOrder.indexOf(b);
    return (ai < 0 ? fieldOrder.length : ai) - (bi < 0 ? fieldOrder.length : bi) || a.localeCompare(b, 'en');
  });
  return `@${entry.type}{${entry.key},\n${names.map(name => `  ${name} = {${nameFields.has(name) ? formatNames(entry.fields[name]!) : entry.fields[name]}},`).join('\n')}\n}`;
}

// Filename-only cleanup; the bibliography retains original LaTeX and case-protection braces.
function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" })[entity] ?? entity)
    .replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, '').normalize('NFC');
}
function filenamePart(value: string): string {
  return plainText(value).replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, ' ').replace(/[\s_]+/g, ' ').trim().replace(/[. ]+$/g, '').replace(/ /g, '-');
}
function creatorName(creator: Creator): string {
  return creator.name ?? [creator.prefix, creator.lastName].filter(Boolean).join(' ');
}

export function makeFilename(fields: Record<string, string>): string {
  const selected = Object.fromEntries(['author', 'editor', 'title'].filter(name => fields[name]).map(name => [name, fields[name]!]));
  const normalized = parse(serialize({ type: 'misc', key: 'filename', fields: selected }), {
    sentenceCase: false, caseProtection: false, fieldMode: { title: 'richtext' },
  }).entries[0]?.fields;
  const creators = normalized?.author ?? normalized?.editor ?? [];
  const authors = creators.slice(0, 3).map(creatorName).join('-') + (creators.length > 3 ? '-et-al' : '');
  const date = fields.date ?? fields.year ?? '';
  const year = date.match(/^-?\d{4}/)?.[0] ?? 'nd';
  const title = typeof normalized?.title === 'string' ? normalized.title : fields.title ?? 'Untitled';
  const parts = [filenamePart(year), filenamePart(authors) || 'Unknown', filenamePart(title) || 'Untitled'];
  // Keep the UTF-8 basename below common 255-byte limits, including room for a .pdf extension.
  let filename = parts.join('_');
  while (new TextEncoder().encode(filename).length > 240) filename = Array.from(filename).slice(0, -1).join('');
  return filename.replace(/[. ]+$/g, '');
}

export function makeCitationKey(fields: Record<string, string>, type = 'misc'): string {
  const year = (fields.date ?? fields.year ?? '').match(/^(\d{4})(?=$|[-/])/)?.[1];
  if (!year || !fields.author?.trim()) return '';
  const firstAuthor = parse(serialize({ type: 'misc', key: 'key', fields: { author: fields.author } }), {
    sentenceCase: false, caseProtection: false,
  }).entries[0]?.fields.author?.[0];
  if (!firstAuthor) return '';
  const surname = plainText(creatorName(firstAuthor)).replace(/[^\p{L}\p{M}\p{N}-]/gu, '');
  if (!surname || /^(?:others|unknown|anonymous)$/i.test(surname)) return '';
  const firstPage = type.toLowerCase() === 'incollection'
    ? plainText(fields.pages ?? '').trim().match(/^(?:pp?\.?\s*)?([a-z]*\d+[a-z]*|[ivxlcdm]+)(?=\s*(?:[-–—,;]|$))/i)?.[1]
    : undefined;
  return `${surname}${year}${firstPage ? `p${firstPage}` : ''}`;
}

function normalizeCitationKeys(entries: Pick<VerbatimEntry, 'type' | 'key' | 'fields'>[], warnings: string[], selectedIndex?: number): void {
  const generated = entries.map((entry, index) => selectedIndex !== undefined && index !== selectedIndex
    ? '' : makeCitationKey(entry.fields, entry.type));
  const candidates = entries.map((entry, index) => generated[index] || entry.key);
  const counts = new Map<string, number>();
  for (const key of candidates) if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const [index, entry] of entries.entries()) {
    const candidate = candidates[index] ?? '';
    const key = !generated[index] || counts.get(candidate) === 1 ? candidate : '';
    if (candidate && !key) warnings.push(`引用キー ${candidate} が重複するため、空欄にしました。`);
    entry.key = key;
  }
}

export function convertBib(input: string, { generateKeys = true, language, downloadDate }: { generateKeys?: boolean; language?: string; downloadDate?: string } = {}): Conversion {
  if (language !== undefined && /[{}\\\p{Cc}]/u.test(language)) throw new Error('言語名には波括弧・バックスラッシュ・制御文字を使えません。');
  if (downloadDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(downloadDate)) throw new Error('ダウンロード日は YYYY-MM-DD で指定してください。');
  if (!input.trim()) throw new Error('.bib の内容を入力してください。');
  const library = parseVerbatim(input);
  if (library.errors.length) throw new Error(library.errors.map(error => error.error).join('\n'));
  if (!library.entries.length) throw new Error('文献エントリが見つかりません。');
  const warnings: string[] = [];
  const keys = new Set<string>();
  const entries: FormattedEntry[] = library.entries.map(entry => {
    if (/[\s,{}]/u.test(entry.key)) throw new Error(`引用キーが不正です: ${entry.key}`);
    if (entry.key && keys.has(entry.key)) throw new Error(`引用キーが重複しています: ${entry.key}`);
    if (entry.key) keys.add(entry.key);
    const source = Object.fromEntries(Object.entries(entry.fields).map(([name, value]) => [name.toLowerCase(), value]));
    const fields: Record<string, string> = Object.create(null);
    const removed: string[] = [];
    for (const [name, value] of Object.entries(source)) {
      const target = canonicalFieldName(name);
      if (!excludedFields.has(target) && (target.startsWith('_') || retained.has(target))) {
        if (target !== name && source[target] !== undefined) {
          if (source[target] !== value) warnings.push(`${entry.key}: ${name} と ${target} が異なるため ${target} を優先しました。`);
          continue;
        }
        fields[target] = value.trim();
      } else removed.push(name);
    }
    if (language !== undefined) fields.language = language.trim();
    if (downloadDate !== undefined) fields._download_at = downloadDate;
    if (language === 'japanese' && fields.author) {
      fields.author = fields.author.split(/\s+and\s+/i).flatMap(japaneseAuthorList).join(' and ');
    }
    if (!fields.date && /^\d{4}$/.test(fields.year ?? '')) {
      const month = fields.month?.padStart(2, '0');
      const day = fields.day?.padStart(2, '0');
      if ((!month && !day) || (month && /^(0[1-9]|1[0-2])$/.test(month) && (!day || /^(0[1-9]|[12]\d|3[01])$/.test(day)))) {
        fields.date = [fields.year, month, day].filter(Boolean).join('-');
        delete fields.year; delete fields.month; delete fields.day;
      } else warnings.push(`${entry.key}: 年月日を確認してください。元の year/month/day を保持しました。`);
    } else if (fields.date) {
      if (fields.year && !fields.date.startsWith(fields.year)) warnings.push(`${entry.key}: date と year が異なるため date を優先しました。`);
      delete fields.year; delete fields.month; delete fields.day;
    }
    if (fields.doi) fields.doi = fields.doi.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '').trim();
    if (fields.pages) fields.pages = fields.pages.replace(/(\d)\s*[-–—]+\s*(?=\d)/g, '$1--');
    const type = typeAliases[entry.type.toLowerCase()] ?? entry.type.toLowerCase();
    if (entry.type.toLowerCase() === 'phdthesis' && !fields.type) fields.type = 'phdthesis';
    if (entry.type.toLowerCase() === 'mastersthesis' && !fields.type) fields.type = 'mathesis';
    if (!['article', 'book', 'mvbook', 'inbook', 'bookinbook', 'suppbook', 'booklet', 'collection', 'mvcollection', 'incollection', 'suppcollection', 'manual', 'misc', 'online', 'patent', 'periodical', 'suppperiodical', 'proceedings', 'mvproceedings', 'inproceedings', 'reference', 'mvreference', 'inreference', 'report', 'set', 'thesis', 'unpublished', 'xdata', 'software', 'dataset'].includes(type)) warnings.push(`${entry.key}: 未知の文献種別 ${type} を保持しました。`);
    return { key: entry.key, type, fields, filename: '', removed };
  });
  if (generateKeys) normalizeCitationKeys(entries, warnings);
  for (const entry of entries) {
    entry.filename = makeFilename(entry.fields);
    if (!entry.fields.title) warnings.push(`${entry.key}: title がありません。`);
    if (!entry.fields.author && !entry.fields.editor) warnings.push(`${entry.key}: author / editor がありません。`);
    if (!entry.fields.date && !entry.fields.year) warnings.push(`${entry.key}: 出版年がありません。`);
  }
  const filenames = new Set<string>();
  for (const entry of entries) {
    if (filenames.has(entry.filename)) warnings.push(`${entry.key}: ファイル名が重複しています。保存時に区別してください。`);
    filenames.add(entry.filename);
  }
  const preambles = library.preambles.map(value => `@preamble{${value}}`);
  return { bib: [...preambles, ...entries.map(serialize)].join('\n\n') + '\n', entries, warnings };
}

export function changeEntryType(input: string, key: string, selection: string, entryIndex?: number): Conversion {
  const supported = new Set(['article', 'inproceedings', 'book', 'incollection', 'thesis', 'phdthesis', 'mathesis', 'report', 'online', 'unpublished', 'misc']);
  if (!supported.has(selection)) throw new Error('変更先の文献種別を選択してください。');
  const library = parseVerbatim(input);
  if (library.errors.length) throw new Error('bib を読み込めません。');
  const entry = entryIndex === undefined ? library.entries.find(entry => entry.key === key) : library.entries[entryIndex];
  if (!entry) throw new Error('変更する文献が見つかりません。');
  entry.type = ['phdthesis', 'mathesis'].includes(selection) ? 'thesis' : selection;
  if (entry.type === 'thesis' && selection !== 'thesis') entry.fields.type = selection;
  else if (['phdthesis', 'mathesis'].includes(entry.fields.type ?? '')) delete entry.fields.type;
  const warnings: string[] = [];
  normalizeCitationKeys(library.entries, warnings, library.entries.indexOf(entry));
  const preambles = library.preambles.map(value => `@preamble{${value}}`);
  const bib = [...preambles, ...library.entries.map(serialize)].join('\n\n') + '\n';
  const converted = convertBib(bib, { generateKeys: false });
  return { ...converted, warnings: [...warnings, ...converted.warnings], bib };
}

export function addCommonField(input: string, field: string): Conversion {
  const library = parseVerbatim(input);
  if (library.errors.length || library.entries.length !== 1) throw new Error('フィールドの追加は正しい bib が1件のときに使えます。');
  const entry = library.entries[0]!;
  if (entry.fields[field] !== undefined) throw new Error('このフィールドは追加済みです。');
  const actions = getFieldActions(entry.type, entry.fields);
  if (![...actions.required.flat(), ...actions.optional].includes(field)) throw new Error('この種別には追加できないフィールドです。');
  entry.fields[field] = '';
  const preambles = library.preambles.map(value => `@preamble{${value}}`);
  const bib = [...preambles, serialize(entry)].join('\n\n') + '\n';
  return { ...convertBib(bib, { generateKeys: false }), bib };
}

export function getSingleEntryFieldActions(input: string): ReturnType<typeof getFieldActions> {
  const library = parseVerbatim(input);
  if (library.errors.length || library.entries.length !== 1) throw new Error('フィールド操作は正しい bib が1件のときに使えます。');
  const entry = library.entries[0]!;
  return getFieldActions(entry.type, entry.fields);
}

export function removeEntryField(input: string, field: string): Conversion {
  const library = parseVerbatim(input);
  if (library.errors.length || library.entries.length !== 1) throw new Error('フィールド操作は正しい bib が1件のときに使えます。');
  const entry = library.entries[0]!;
  if (!getFieldActions(entry.type, entry.fields).remove.includes(field)) throw new Error('このフィールドは種別に対応しています。');
  delete entry.fields[field];
  const preambles = library.preambles.map(value => `@preamble{${value}}`);
  const bib = [...preambles, serialize(entry)].join('\n\n') + '\n';
  return { ...convertBib(bib, { generateKeys: false }), bib };
}
