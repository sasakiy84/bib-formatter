import { expect, test } from 'bun:test';
import { parseVerbatim } from '@retorquere/bibtex-parser/js';
import { convertPdf, metadataToBib, parseXmp, japaneseAuthorList } from '../src/pdf';
import { englishXmp, makePdf } from './pdf-fixtures';

test('English PDF Info produces biblatex and at most three authors in the filename', async () => {
  const conversion = await convertPdf(await makePdf({ title: 'An English Title', author: 'Smith, Jane; Jones, Alex; Lee, Sam; Brown, Chris', year: '2024' }));
  expect(conversion.entries[0]?.filename).toBe('2024_Smith-Jones-Lee-et-al_An-English-Title');
  expect(conversion.entries[0]?.fields.author).toBe('Smith, Jane and Jones, Alex and Lee, Sam and Brown, Chris');
  expect(conversion.entries[0]?.type).toBe('misc');
});
test('Japanese PDF Info decodes UTF-16 metadata and retains Japanese names and titles', async () => {
  const conversion = await convertPdf(await makePdf({ title: '日本語の研究', author: '佐藤, 花子; 鈴木, 太郎', year: '2023' }));
  expect(conversion.entries[0]?.filename).toBe('2023_佐藤-鈴木_日本語の研究');
  expect(conversion.bib).toContain('title = {日本語の研究}');
});
test('compressed XMP overrides Info and retains publication date, journal and DOI', async () => {
  const conversion = await convertPdf(await makePdf({ title: 'Stale title', author: 'Wrong author', year: '1998', xmp: englishXmp }));
  expect(conversion.entries[0]?.filename).toBe('2024_Smith-Jones-Lee-et-al_An-English-PDF-Study');
  expect(conversion.entries[0]?.type).toBe('article');
  expect(conversion.entries[0]?.fields.date).toBe('2024-06-15');
  expect(conversion.entries[0]?.fields.journaltitle).toBe('Journal of Examples');
  expect(conversion.entries[0]?.fields.doi).toBe('10.1234/pdf_test');
});
test('XMP accepts attribute metadata and preserves entity-encoded ampersands', () => {
  const xmp = '<rdf:Description xmlns:rdf="rdf" xmlns:dc="dc" xmlns:prism="prism" dc:title="Research &amp; Development" prism:publicationDate="2025" />';
  expect(parseXmp(xmp).title).toBe('Research & Development');
  expect(parseXmp(xmp).publicationDate).toBe('2025');
});
test('corporate XMP author containing and remains a single author', async () => {
  const xmp = '<rdf:Description xmlns:rdf="rdf" xmlns:dc="dc"><dc:creator><rdf:Seq><rdf:li>Research and Development Group</rdf:li></rdf:Seq></dc:creator><dc:title>Annual Report</dc:title></rdf:Description>';
  const conversion = await convertPdf(await makePdf({ xmp }));
  expect(conversion.entries[0]?.fields.author).toBe('{Research and Development Group}');
  expect(conversion.entries[0]?.filename).toBe('nd_Research-and-Development-Group_Annual-Report');
});
test('PDF creation year is not substituted for publication year', async () => {
  const conversion = await convertPdf(await makePdf({ title: 'Undated Paper', author: 'Smith, Jane' }));
  expect(conversion.entries[0]?.fields.date).toBeUndefined();
  expect(conversion.entries[0]?.filename).toBe('nd_Smith_Undated-Paper');
  expect(conversion.warnings.join('\n')).toContain('出版日がありません');
});
test('PDF without metadata exports an editable placeholder and missing-field warnings', async () => {
  const conversion = await convertPdf(await makePdf());
  expect(conversion.entries[0]?.filename).toBe('nd_Unknown_Untitled');
  expect(conversion.warnings.join('\n')).toContain('title がありません');
  expect(conversion.warnings.join('\n')).toContain('author / editor がありません');
});
test('invalid XMP falls back to Info with an explicit warning', async () => {
  const conversion = await convertPdf(await makePdf({ title: 'Fallback', author: 'Smith, Jane', xmp: '<broken>' }));
  expect(conversion.entries[0]?.fields.title).toBe('Fallback');
  expect(conversion.warnings.join('\n')).toContain('XMP メタデータを読み込めなかった');
});
test('PDF metadata special characters cannot inject bibliography entries', () => {
  const conversion = metadataToBib({ title: 'Research {Draft} & 50% \\ test_#1', authors: ['山田, 太郎'], publicationDate: '', journal: '', doi: '' });
  expect(parseVerbatim(conversion.bib).errors).toHaveLength(0);
  expect(parseVerbatim(conversion.bib).entries).toHaveLength(1);
  expect(conversion.entries[0]?.fields.title).toBe(String.raw`Research \{Draft\} \& 50\% \textbackslash{} test\_\#1`);
});
test('corrupt and non-PDF files fail with a useful message', async () => {
  await expect(convertPdf(new TextEncoder().encode('not a PDF'))).rejects.toThrow('有効な PDF');
});
test('XMP rejects document types and entity definitions without network resolution', () => {
  expect(() => parseXmp('<!DOCTYPE test [<!ENTITY secret SYSTEM "https://example.org">]><test>&secret;</test>')).toThrow();
});

test('ignores stale XMP tool defaults in favor of useful Info metadata', async () => {
  const xmp = '<rdf:Description xmlns:rdf="rdf" xmlns:dc="dc"><dc:title>LaTeX with hyperref</dc:title><dc:creator>LaTeX with hyperref</dc:creator></rdf:Description>';
  const converted = await convertPdf(await makePdf({ title: '架空の研究', author: '山田 太郎, 鈴木 花子, 佐藤 一郎, 田中 次郎', year: '2025', xmp }));
  expect(converted.entries[0]?.filename).toBe('2025_山田-鈴木-佐藤-et-al_架空の研究');
  expect(converted.entries[0]?.fields.author).toBe('山田, 太郎 and 鈴木, 花子 and 佐藤, 一郎 and 田中, 次郎');
});
test('Japanese name splitting preserves Western comma notation', () => {
  expect(japaneseAuthorList('Smith, Jane')).toEqual(['Smith, Jane']);
  expect(japaneseAuthorList('山田, 太郎')).toEqual(['山田, 太郎']);
  expect(japaneseAuthorList('山田 太郎, 鈴木 花子')).toEqual(['山田, 太郎', '鈴木, 花子']);
});
test('PDF import uses metadata only and does not fill a missing year from page text', async () => {
  const converted = await convertPdf(await makePdf({ title: 'Metadata Title', author: 'Smith, Jane', text: [
    { text: 'Example Conference (2025)', x: 80, y: 810, size: 10 },
  ] }));
  expect(converted.entries[0]?.filename).toBe('nd_Smith_Metadata-Title');
  expect(converted.entries[0]?.fields.booktitle).toBeUndefined();
  expect(converted.warnings.join('\n')).not.toContain('1ページ目');
});
