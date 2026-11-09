import { describe, expect, test } from 'bun:test';
import { parseVerbatim } from '@retorquere/bibtex-parser/js';
import { convertBib, makeFilename } from '../src/formatter';

function first(input: string): ReturnType<typeof convertBib>['entries'][number] {
  const entry = convertBib(input).entries[0];
  if (!entry) throw new Error('No entry');
  return entry;
}
describe('biblatex conversion', () => {
  test('English journal article converts aliases, date, DOI and page ranges', () => {
    const entry = first('@ARTICLE{Turing1936, AUTHOR={Turing, Alan M.}, TITLE={On Computable Numbers}, JOURNAL={Proceedings of the London Mathematical Society}, YEAR=1936, MONTH=nov, PAGES={230–265}, DOI={https://doi.org/10.1112/plms/s2-42.1.230}}');
    expect(entry.fields).toEqual({ author: 'Turing, Alan M.', title: 'On Computable Numbers', journaltitle: 'Proceedings of the London Mathematical Society', date: '1936-11', pages: '230--265', doi: '10.1112/plms/s2-42.1.230' });
  });
  test('Japanese book retains text and publication fields', () => {
    const entry = first('@book{中谷1938, author={中谷, 宇吉郎},title={雪},publisher={岩波書店},address={東京},year=1938,language={japanese}}');
    expect(entry.filename).toBe('1938_中谷_雪');
    expect(entry.fields.location).toBe('東京');
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
    const entry = first('@misc{x,title={Test},_memo={日本語 {メモ}},_file={paper.pdf},abstract={Long abstract},keywords={tag},file={/secret/local.pdf},note={private}}');
    expect(entry.fields._memo).toBe('日本語 {メモ}');
    expect(entry.fields._file).toBe('paper.pdf');
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
  test('crossref retains references and inherits the year for filenames', () => {
    const converted = convertBib('@inproceedings{child,title={Paper},author={Smith, Jane},crossref={parent}}\n@proceedings{parent,title={Conference},year=2025,editor={Lee, Sam}}');
    expect(converted.entries[0]?.filename).toBe('2025_Smith_Paper');
    expect(converted.entries[0]?.fields.crossref).toBe('parent');
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
  test('warns about missing information, unresolved references and unknown entry types', () => {
    const converted = convertBib('@unknown{x,crossref={missing}}');
    expect(converted.warnings.join('\n')).toContain('missing');
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
    expect(makeFilename({ editor: '山田, 太郎', title: '参考資料' })).toBe('n.d._山田_参考資料');
    expect(makeFilename({ title: 'Unknown Work' })).toBe('n.d._Unknown_Unknown-Work');
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
