import { getFieldActions } from '../src/field-actions';
import { describe, expect, test } from 'bun:test';
import { parseVerbatim } from '@retorquere/bibtex-parser/js';
import { addCommonField, changeEntryType, convertBib, makeCitationKey, makeFilename, removeEntryField } from '../src/formatter';
import { detectBibLanguage } from '../src/language';

function first(input: string): ReturnType<typeof convertBib>['entries'][number] {
  const entry = convertBib(input).entries[0];
  if (!entry) throw new Error('No entry');
  return entry;
}
test('conversion removes location and its address alias while retaining custom fields and download dates', () => {
  const converted = first('@book{book,author={山田, 太郎},date={2026},location={東京},address={大阪},_download_at={2020-01-01},_notes={Keep},_tags={Tag},_memo={Memo}}');
  expect(converted.fields.location).toBeUndefined();
  expect(converted.fields.address).toBeUndefined();
  expect(converted.fields._download_at).toBe('2020-01-01');
  expect(converted.removed).toEqual(['location', 'address']);
  expect(converted.fields._notes).toBe('Keep');
  expect(converted.fields._tags).toBe('Tag');
  expect(converted.fields._memo).toBe('Memo');
});
test('conversion records the provided local date and preserves it during editing previews', () => {
  const converted = convertBib('@book{a,title={A},_download_at={2020-01-01}} @misc{b,title={B}}', { downloadDate: '2026-11-12' });
  expect(converted.entries.map(entry => entry.fields._download_at)).toEqual(['2026-11-12', '2026-11-12']);
  expect(convertBib(converted.bib, { generateKeys: false }).bib).toBe(converted.bib);
});
describe('simple language detection', () => {
  test('uses title text instead of the nationality of authors', () => {
    expect(detectBibLanguage('@misc{x,title={日本語の研究},author={Smith, Jane}}')).toBe('japanese');
    expect(detectBibLanguage('@misc{x,title={An English Study},author={山田, 太郎}}')).toBe('english');
  });
  test('prefers explicit language metadata including other languages', () => {
    expect(detectBibLanguage('@misc{x,title={研究},language={en-US}}')).toBe('english');
    expect(detectBibLanguage('@misc{x,title={A Study},langid={japanese}}')).toBe('japanese');
    expect(detectBibLanguage('@misc{x,title={Une étude},language={french}}')).toBe('french');
  });
  test('handles other scripts and leaves missing or malformed information undecided', () => {
    expect(detectBibLanguage('@misc{x,title={Исследование}}')).toBe('');
    expect(detectBibLanguage('@misc{x,title={123}}')).toBeUndefined();
    expect(detectBibLanguage('@misc{broken')).toBeUndefined();
  });
});
test('ten-name author, editor and translator lists fit on one line without splitting corporate names', () => {
  const names = [...Array.from({ length: 9 }, (_, index) => `Surname${index}, Given${index}`), '{Research and Development Group}'];
  const list = names.join('\n and\n ');
  const converted = convertBib(`@book{names,author={${list}},editor={${list}},translator={${list}},date={2026}}`);
  for (const field of ['author', 'editor', 'translator']) expect(converted.bib).toContain(`  ${field} = {${names.join(' and ')}},`);
});
test('eleven-name lists wrap by creator and remain stable after repeated conversion', () => {
  const names = [...Array.from({ length: 10 }, (_, index) => `Surname${index}, Given${index}`), '{Research and Development Group}'];
  const converted = convertBib(`@book{names,author={${names.join(' and ')}},date={2026}}`);
  expect(converted.bib).toContain(`  author = {\n    ${names.join('\n    and ')}\n  },`);
  expect(convertBib(converted.bib).bib).toBe(converted.bib);
  expect(converted.entries[0]?.fields.author).toBe(names.join(' and '));
});
describe('biblatex conversion', () => {
  test('English journal article converts aliases, date, DOI and page ranges', () => {
    const entry = first('@ARTICLE{Turing1936, AUTHOR={Turing, Alan M.}, TITLE={On Computable Numbers}, JOURNAL={Proceedings of the London Mathematical Society}, YEAR=1936, MONTH=nov, PAGES={230–265}, DOI={https://doi.org/10.1112/plms/s2-42.1.230}}');
    expect(entry.fields).toEqual({ author: 'Turing, Alan M.', title: 'On Computable Numbers', journaltitle: 'Proceedings of the London Mathematical Society', date: '1936-11', pages: '230--265', doi: '10.1112/plms/s2-42.1.230' });
  });
  test('Japanese book retains text and publication fields', () => {
    const entry = first('@book{中谷1938, author={中谷, 宇吉郎},title={雪},publisher={岩波書店},address={東京},year=1938,language={japanese}}');
    expect(entry.filename).toBe('1938_中谷_雪');
    expect(entry.fields.location).toBeUndefined();
    expect(entry.fields.publisher).toBe('岩波書店');
  });
  test('Japanese conference paper preserves multiple names and protected title', () => {
    const entry = first('@conference{jp,author={佐藤, 花子 and 鈴木, 太郎},title={日本語の{AI}研究},booktitle={情報処理学会研究報告},year=2024,pages={1-8}}');
    expect(entry.type).toBe('inproceedings');
    expect(entry.filename).toBe('2024_佐藤-鈴木_日本語のAI研究');
    expect(entry.fields.title).toBe('日本語の{AI}研究');
  });
  test('English book preserves editions, editors, ISBN and publishers', () => {
    const entry = first('@book{knuth,author={Donald E. Knuth},title={The Art of Computer Programming},year=1997,edition={3},volume={1},publisher={Addison-Wesley},isbn={978-0201896831}}');
    expect(entry.filename).toBe('1997_Knuth_The-Art-of-Computer-Programming');
    expect(entry.fields.edition).toBe('3');
    expect(entry.fields.isbn).toBe('978-0201896831');
  });
  test('retains underscore fields while removing abstracts, keywords and attachments', () => {
    const entry = first('@misc{x,title={Test},_memo={日本語 {メモ}},_file={paper.pdf},_notes={Keep this},abstract={Long abstract},keywords={tag},file={/secret/local.pdf},note={private}}');
    expect(entry.fields._memo).toBe('日本語 {メモ}');
    expect(entry.fields._file).toBe('paper.pdf');
    expect(entry.fields.note).toBeUndefined();
    expect(entry.fields._notes).toBe('Keep this');
    expect(entry.removed).toEqual(['abstract', 'keywords', 'file', 'note']);
  });
  test('canonical biblatex fields take precedence over conflicting aliases', () => {
    const converted = convertBib('@article{x,journal={Old},journaltitle={New},year=2023,date={2024-05}}');
    expect(converted.entries[0]?.fields.journaltitle).toBe('New');
    expect(converted.entries[0]?.fields.year).toBeUndefined();
    expect(converted.warnings.join('\n')).toContain('異なる');
  });
  test('expands string macros and concatenated fields', () => {
    expect(first('@string{journalname="Journal"}\n@article{x,journal=journalname # " of Science",title={Test},year=2024}').fields.journaltitle).toBe('Journal of Science');
  });
  test('does not alter LaTeX, capitalization braces, math or escaped quotes', () => {
    const title = String.raw`An {AI} Study of $x^2$ and {G\"odel}`;
    expect(first(`@article{x,title={${title}}}`).fields.title).toBe(title);
  });
  test('theses and reports use biblatex types', () => {
    const thesis = first('@phdthesis{x,title={Thesis},school={Example University},year=2020}');
    expect(thesis.type).toBe('thesis');
    expect(thesis.fields.type).toBe('phdthesis');
    expect(thesis.fields.institution).toBe('Example University');
    expect(first('@mastersthesis{x,title={T}}').fields.type).toBe('mathesis');
    expect(first('@techreport{x,title={R},institution={Lab},number={TR-1}}').type).toBe('report');
  });
  test('crossref is removed without inheriting metadata from another entry', () => {
    const converted = convertBib('@inproceedings{child,title={Paper},author={Smith, Jane},crossref={parent}}\n@proceedings{parent,title={Conference},year=2025,editor={Lee, Sam}}');
    expect(converted.entries[0]?.filename).toBe('nd_Smith_Paper');
    expect(converted.entries[0]?.fields.crossref).toBeUndefined();
  });
  test('preserves preambles as valid BibTeX', () => {
    const input = String.raw`@preamble{"\newcommand{\foo}{bar}"} @misc{x,title={\foo Test}}`;
    const output = convertBib(input).bib;
    expect(parseVerbatim(output).preambles).toEqual(parseVerbatim(input).preambles);
  });
  test('formatting is idempotent for mixed English and Japanese input', () => {
    const input = '@article{en,title={The {AI} Study},year=2024,author={Smith, Jane}}\n@book{jp,title={雪},year=1938,author={中谷, 宇吉郎},_read={yes}}';
    const output = convertBib(input).bib;
    expect(convertBib(output).bib).toBe(output);
  });
  test('rejects malformed input instead of exporting partial results', () => {
    expect(() => convertBib('@article{good,title={Good}} @book{bad,title={Unclosed')).toThrow();
  });
  test('rejects empty input, non-bibliography text and duplicate citation keys', () => {
    expect(() => convertBib(' ')).toThrow();
    expect(() => convertBib('Hello')).toThrow();
    expect(() => convertBib('@misc{x,title={A}} @misc{x,title={B}}')).toThrow('重複');
  });
  test('warns about missing information and unknown entry types', () => {
    const converted = convertBib('@unknown{x,crossref={missing}}');
    expect(converted.warnings.join('\n')).toContain('title');
    expect(converted.warnings.join('\n')).toContain('未知');
  });
});
describe('copyable filenames', () => {
  test('uses at most three English authors with et-al for additional authors', () => {
    expect(makeFilename({ year: '2024', author: 'Smith, Jane and Jones, Alex and Lee, Sam and Brown, Chris', title: 'An English Title' })).toBe('2024_Smith-Jones-Lee-et-al_An-English-Title');
  });
  test('three authors do not receive an et-al suffix', () => {
    expect(makeFilename({ year: '2024', author: 'Smith, Jane and Jones, Alex and Lee, Sam', title: 'Test' })).toBe('2024_Smith-Jones-Lee_Test');
  });
  test('resolves name particles, corporate authors and LaTeX accents', () => {
    expect(makeFilename({ year: '2024', author: String.raw`von Neumann, John and {Research and Development Group} and M{\"u}ller, Anna`, title: 'The {NASA} Study' })).toBe('2024_von-Neumann-Research-and-Development-Group-Müller_The-NASA-Study');
  });
  test('uses editor as fallback without inventing missing dates', () => {
    expect(makeFilename({ editor: '山田, 太郎', title: '参考資料' })).toBe('nd_山田_参考資料');
    expect(makeFilename({ title: 'Unknown Work' })).toBe('nd_Unknown_Unknown-Work');
  });
  test('removes whitespace and filesystem-reserved characters', () => {
    const name = makeFilename({ year: '2024', author: 'Smith, Jane', title: 'A: title / with "quotes"? * <tags> | \\ test. ' });
    expect(name).not.toMatch(/[\s<>:"/\\|?*\p{Cc}]/u);
    expect(name).not.toEndWith('.');
  });
  test('limits long Unicode names without splitting surrogate pairs', () => {
    const name = makeFilename({ year: '2024', author: '佐藤, 花子', title: '日本語の論文📚'.repeat(100) });
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(240);
    expect(name).not.toContain('\ufffd');
  });
  test('warns about filename collisions', () => {
    expect(convertBib('@misc{a,title={Same}} @misc{b,title={Same}}').warnings.join('\n')).toContain('ファイル名が重複');
  });
});

test('changes only the selected entry type and preserves other entries and custom fields', () => {
  const input = '@misc{a,title={A},author={Smith, Jane},year=2024,_read={yes}} @book{b,title={B},year=2025}';
  const changed = changeEntryType(input, 'a', 'inproceedings');
  expect(changed.entries[0]?.type).toBe('inproceedings');
  expect(changed.entries[0]?.fields._read).toBe('yes');
  expect(changed.entries[0]?.filename).toBe('2024_Smith_A');
  expect(changed.entries[1]?.type).toBe('book');
});
test('degree selection produces biblatex thesis type and can be changed again', () => {
  const changed = changeEntryType('@misc{x,title={T}}', 'x', 'phdthesis');
  expect(changed.entries[0]?.type).toBe('thesis');
  expect(changed.entries[0]?.fields.type).toBe('phdthesis');
  expect(changeEntryType(changed.bib, 'x', 'article').entries[0]?.fields.type).toBeUndefined();
});

test('adds an empty common field without changing existing bibliography values', () => {
  const changed = addCommonField('@book{x,title={Original},author={山田, 太郎},date={2024},_memo={Keep}}', 'doi');
  expect(changed.entries[0]?.fields.doi).toBe('');
  expect(changed.entries[0]?.fields.title).toBe('Original');
  expect(changed.entries[0]?.fields._memo).toBe('Keep');
  expect(changed.entries[0]?.filename).toBe('2024_山田_Original');
});
test('does not add duplicate fields or add fields to multiple entries', () => {
  expect(() => addCommonField('@misc{x,doi={10.1234/example}}', 'doi')).toThrow('追加済み');
  expect(() => addCommonField('@misc{x,title={X}} @misc{y,title={Y}}', 'doi')).toThrow('1件');
});

test('fills an empty citation key from the first author surname and date year', () => {
  const converted = convertBib('@inproceedings{,author={山田, 太郎 and 鈴木, 花子},title={架空の研究},date={2026-03}}');
  expect(converted.entries[0]?.key).toBe('山田2026');
  expect(converted.bib).toStartWith('@inproceedings{山田2026,');
});
test('normalizes existing English citation keys to surname and year without article pages', () => {
  expect(makeCitationKey({ author: 'Jane Smith and Jones, Alex', year: '2024' })).toBe('Smith2024');
  expect(makeCitationKey({ author: String.raw`M{\"u}ller, Anna`, date: '2025-04' })).toBe('Müller2025');
  expect(first('@misc{keep-this-key,author={Smith, Jane},year=2024}').key).toBe('Smith2024');
  expect(first('@article{LINELL2019101230,author={Linell, Per},year=2019,pages={101230}}').key).toBe('Linell2019');
  expect(first('@misc{keep-this-key,title={No author or year}}').key).toBe('keep-this-key');
});
test('incollection keys append only the starting page when it is available', () => {
  expect(first('@incollection{old,author={山田, 太郎},date={2026-03},pages={123–145}}').key).toBe('山田2026p123');
  expect(makeCitationKey({ author: 'Smith, Jane', year: '2024', pages: 'S12--S20' }, 'incollection')).toBe('Smith2024pS12');
  expect(makeCitationKey({ author: 'Smith, Jane', year: '2024', pages: 'xii--xvi' }, 'incollection')).toBe('Smith2024pxii');
  expect(first('@incollection{old,author={Smith, Jane},year=2024}').key).toBe('Smith2024');
  expect(first('@incollection{old,author={Smith, Jane},year=2024,pages={unknown},pagetotal={123}}').key).toBe('Smith2024');
  expect(first('@inproceedings{old,author={Smith, Jane},year=2024,pages={123-145}}').key).toBe('Smith2024');
});
test('conversion removes cross-entry reference fields while preserving custom fields', () => {
  const converted = first('@article{old,author={Linell, Per},year=2019,title={Example},crossref={book},xref={book},xdata={shared},related={a,b},relatedtype={reprintof},relatedoptions={skipbib},relatedstring={Other},entryset={a,b},ids={alias},_notes={Keep}}');
  expect(converted.key).toBe('Linell2019');
  expect(converted.fields).toEqual({ author: 'Linell, Per', date: '2019', title: 'Example', _notes: 'Keep' });
  expect(converted.removed).toEqual(['crossref', 'xref', 'xdata', 'related', 'relatedtype', 'relatedoptions', 'relatedstring', 'entryset', 'ids']);
});
test('type changes add and remove an incollection key page suffix', () => {
  const input = '@article{Smith2024,author={Smith, Jane},date={2024},pages={123--145}}';
  const chapter = changeEntryType(input, 'Smith2024', 'incollection');
  expect(chapter.entries[0]?.key).toBe('Smith2024p123');
  const article = changeEntryType(chapter.bib, 'Smith2024p123', 'article');
  expect(article.entries[0]?.key).toBe('Smith2024');
});
test('leaves keys empty when author or publication year is unavailable', () => {
  const converted = convertBib('@misc{,author={山田, 太郎},title={No year}} @misc{,year=2024,title={No author}} @book{,editor={Smith, Jane},year=2024,title={Editor only}}');
  expect(converted.entries.map(entry => entry.key)).toEqual(['', '', '']);
  expect(converted.bib).toContain('@misc{,');
  expect(converted.entries[0]?.filename).toBe('nd_山田_No-year');
});
test('does not generate duplicate keys for the same author and year', () => {
  const converted = convertBib('@misc{,author={Smith, Jane},year=2024,title={A}} @misc{,author={Smith, Jane},year=2024,title={B}}');
  expect(converted.entries.map(entry => entry.key)).toEqual(['', '']);
  expect(converted.warnings.join('\n')).toContain('Smith2024 が重複');
});
test('page suffixes distinguish incollection entries by the same author and year', () => {
  const converted = convertBib('@incollection{oldA,author={Smith, Jane},year=2024,pages={123-145}} @incollection{oldB,author={Smith, Jane},year=2024,pages={146-160}}');
  expect(converted.entries.map(entry => entry.key)).toEqual(['Smith2024p123', 'Smith2024p146']);
});
test('a generated key does not collide with an explicit key', () => {
  const converted = convertBib('@misc{Smith2024,title={Existing}} @misc{,author={Smith, Jane},year=2024}');
  expect(converted.entries.map(entry => entry.key)).toEqual(['Smith2024', '']);
});
test('type controls can target the second of multiple entries with empty keys', () => {
  const converted = changeEntryType('@misc{,title={First}} @misc{,title={Second}}', '', 'book', 1);
  expect(converted.entries.map(entry => entry.type)).toEqual(['misc', 'book']);
});
test('Japanese setting adds language and normalizes surname-first Japanese names', () => {
  const converted = convertBib('@misc{,author={山田 太郎, 鈴木 花子},title={研究},year=2026,language={english}}', { language: 'japanese' });
  expect(converted.entries[0]?.fields.language).toBe('japanese');
  expect(converted.entries[0]?.fields.author).toBe('山田, 太郎 and 鈴木, 花子');
  expect(converted.entries[0]?.key).toBe('山田2026');
  expect(converted.entries[0]?.filename).toBe('2026_山田-鈴木_研究');
});
test('English setting retains English name order and assigns language to every entry', () => {
  const converted = convertBib('@misc{,author={Jane Smith},title={A Study},year=2024} @book{b,title={Book}}', { language: 'english' });
  expect(converted.entries.map(entry => entry.fields.language)).toEqual(['english', 'english']);
  expect(converted.entries[0]?.key).toBe('Smith2024');
});
test('other languages can be named explicitly or left unspecified', () => {
  expect(convertBib('@misc{x,title={Test}}', { language: 'french' }).entries[0]?.fields.language).toBe('french');
  expect(convertBib('@misc{x,title={Test},language={english}}', { language: '' }).entries[0]?.fields.language).toBe('');
  expect(() => convertBib('@misc{x,title={Test}}', { language: '{invalid}' })).toThrow('言語名');
});

test('article fields distinguish required journal title from optional DOI and incompatible book title', () => {
  const actions = getFieldActions('article', { title: 'Title', author: 'Smith, Jane', date: '2024', booktitle: 'Wrong', publisher: 'Wrong publisher', _tags: 'keep' });
  expect(actions.required).toEqual([['journaltitle']]);
  expect(actions.optional).toContain('doi');
  expect(actions.optional).not.toContain('editora');
  expect(actions.optional).not.toContain('pubstate');
  expect(actions.optional).not.toContain('eprintclass');
  expect(actions.optional).toContain('_notes');
  expect(actions.optional).not.toContain('_tags');
  expect(actions.optional).not.toContain('title');
  expect(actions.remove).toEqual(['booktitle', 'publisher']);
});
test('book and thesis use the required fields from the standard biblatex styles', () => {
  expect(getFieldActions('book', { editor: 'Smith, Jane', title: 'Book', year: '2024' }).required).toEqual([['author']]);
  const thesis = getFieldActions('thesis', { author: 'Smith, Jane', title: 'Thesis', date: '2024' });
  expect(thesis.required).toEqual([['type'], ['institution']]);
});
test('alternative required fields are satisfied by editor, year or DOI', () => {
  const actions = getFieldActions('online', { editor: 'Editor', title: 'Page', year: '2024', doi: '10.1234/x' });
  expect(actions.required).toEqual([]);
  expect(actions.optional).toContain('author');
  expect(actions.optional).toContain('url');
  expect(actions.optional).not.toContain('date');
  expect(getFieldActions('online', { title: 'Page' }).required).toContainEqual(['doi', 'eprint', 'url']);
});
test('valid optional fields survive conversion and can be added for their type', () => {
  const added = addCommonField('@article{x,title={T},author={A},date={2024},addendum={Keep existing}}', 'doi');
  expect(added.entries[0]?.fields.doi).toBe('');
  expect(added.entries[0]?.fields.addendum).toBe('Keep existing');
  expect(() => addCommonField(added.bib, 'booktitle')).toThrow('種別');
});
test('removes only the selected incompatible field and keeps custom data and preambles', () => {
  const input = '@preamble{"test"} @article{x,title={T},booktitle={Wrong},institution={Also wrong},_tags={keep},_notes={private}}';
  const removed = removeEntryField(input, 'booktitle');
  expect(removed.bib).not.toContain('booktitle');
  expect(removed.bib).toContain('institution = {Also wrong}');
  expect(removed.entries[0]?.fields._tags).toBe('keep');
  expect(parseVerbatim(removed.bib).preambles).toEqual(['"test"']);
  expect(() => removeEntryField(removed.bib, 'title')).toThrow('対応');
  expect(() => removeEntryField(removed.bib, '_notes')).toThrow('対応');
});
test('custom types do not suggest destructive type-specific removals', () => {
  expect(getFieldActions('customa', { institution: 'Keep', special: 'Keep' }).remove).toEqual([]);
});

test('changing type preserves incompatible and unknown fields for explicit removal', () => {
  const changed = changeEntryType('@book{x,title={T},publisher={Keep},special={Also keep}}', 'x', 'article');
  expect(changed.bib).toContain('publisher = {Keep}');
  expect(changed.bib).toContain('special = {Also keep}');
  expect(removeEntryField(changed.bib, 'special').bib).toContain('publisher = {Keep}');
});
