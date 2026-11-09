import definitions from './biblatex-fields.json';

interface TypeFields { required: string[][]; optional: string[]; allowed: string[] }
const types: Record<string, TypeFields> = definitions.types;
const typeAliases: Record<string, string> = definitions.aliases;
const aliases: Record<string, string> = { journal: 'journaltitle', address: 'location', school: 'institution', archiveprefix: 'eprinttype', primaryclass: 'eprintclass' };
export function canonicalFieldName(field: string): string {
  return aliases[field.toLowerCase()] ?? field.toLowerCase();
}
const labels: Record<string, string> = {
  title: 'タイトル', author: '著者', editor: '編者', date: '出版年月日', language: '言語', journaltitle: '掲載誌', booktitle: '会議名・収録書名',
  publisher: '出版社', institution: '所属機関', organization: '組織', type: '資料の種類', volume: '巻', number: '号', pages: 'ページ',
  doi: 'DOI', url: 'URL', urldate: 'アクセス日', eprint: '電子版識別子', eprinttype: '電子版サービス', eprintclass: '電子版分類',
  translator: '翻訳者', annotator: '注釈者', commentator: '解説者', subtitle: '副題', titleaddon: 'タイトル補足',
  editora: '編者A', editorb: '編者B', editorc: '編者C', journalsubtitle: '掲載誌副題', journaltitleaddon: '掲載誌名補足',
  issuetitle: '特集タイトル', issuesubtitle: '特集副題', issuetitleaddon: '特集タイトル補足', origlanguage: '原文の言語', series: 'シリーズ',
  eid: '論文番号', issue: '号の名称', version: '版番号', note: '注記', issn: 'ISSN', isbn: 'ISBN', isrn: '報告書番号',
  addendum: '追記', pubstate: '出版状況', introduction: '序論著者', foreword: '序文著者', afterword: '後書き著者',
  maintitle: '全集タイトル', mainsubtitle: '全集副題', maintitleaddon: '全集タイトル補足', bookauthor: '収録書著者',
  booksubtitle: '収録書副題', booktitleaddon: '収録書名補足', part: '部', edition: '版', volumes: '総巻数', location: '出版地',
  chapter: '章', pagetotal: '総ページ数', howpublished: '出版方法', holder: '権利者', eventtitle: '会議・催事名',
  eventtitleaddon: '会議・催事名補足', eventdate: '開催日', venue: '開催地',
  origdate: '初版年月日', langid: '組版言語', label: '引用ラベル', shorthand: '略称',
  _tags: 'タグ（ユーザー定義）', _notes: 'ノート（ユーザー定義）',
};
export function fieldLabel(field: string): string { return labels[field] ?? field; }

const sharedOptional = ['_tags', '_notes'];
const basicOptional = new Set(['author', 'editor', 'title', 'date', 'language', 'journaltitle', 'booktitle', 'publisher', 'institution', 'type', 'volume', 'number', 'pages', 'doi', 'url', 'urldate', 'isbn', 'edition', '_tags', '_notes']);
const excluded = new Set(['abstract', 'annotation', 'keywords', 'file', 'library', 'execute', 'note', 'crossref', 'xref', 'xdata', 'related', 'relatedtype', 'relatedoptions', 'relatedstring', 'entryset', 'ids']);
const legacyDates = new Set(['year', 'month', 'day']);
export const supportedFields = [...new Set([
  ...definitions.globalFields,
  ...Object.values(types).flatMap(type => [...type.required.flat(), ...type.optional, ...type.allowed]),
])].filter(field => !excluded.has(field));

export interface FieldActions { required: string[][]; optional: string[]; remove: string[] }
export function getFieldActions(type: string, source: Record<string, string>): FieldActions {
  const normalizedType = typeAliases[type.toLowerCase()] ?? type.toLowerCase();
  const schema = types[normalizedType];
  const fields = new Set(Object.keys(source).map(canonicalFieldName));
  const has = (field: string): boolean => fields.has(field) || (field === 'date' && fields.has('year'));
  const usable = (field: string): boolean => !excluded.has(field) && !legacyDates.has(field);
  // Unknown/custom styles have no reliable type-specific exclusion list.
  if (!schema) return { required: [], optional: ['author', 'editor', 'title', 'date', 'language', 'journaltitle', 'booktitle', 'publisher', 'volume', 'number', 'pages', 'doi', 'url', 'urldate', '_tags', '_notes'].filter(field => !has(field)), remove: [] };
  const required = schema.required.filter(group => !group.some(has)).map(group => group.filter(usable)).filter(group => group.length);
  const missingRequired = new Set(required.flat());
  const optional = [...new Set([...schema.optional, ...schema.required.flat(), ...sharedOptional])]
    .filter(field => basicOptional.has(field) && usable(field) && !has(field) && !missingRequired.has(field));
  const allowed = new Set([...definitions.globalFields, ...schema.allowed, ...schema.optional, ...schema.required.flat(), 'date', 'language']);
  const remove = Object.keys(source).filter(field => !field.startsWith('_') && !allowed.has(canonicalFieldName(field)));
  return { required, optional, remove };
}
