import { japaneseAuthorList } from './authors';
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFString, PDFHexString, decodePDFRawStream } from 'pdf-lib';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { convertBib, type Conversion } from './formatter';

export interface PdfMetadata {
  title: string;
  authors: string[];
  publicationDate: string;
  journal: string;
  doi: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function xmlText(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match: string, entity: string): string => {
    const predefined: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (predefined[entity]) return predefined[entity];
    const code = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  }).replace(/\s+/g, ' ').trim();
}
// Read RDF containers as ordered values and prefer the default language for multilingual titles.
function textValues(value: unknown): string[] {
  if (typeof value === 'string') return [xmlText(value)].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (!object(value)) return [];
  if ('Alt' in value && object(value.Alt)) {
    const items: unknown[] = Array.isArray(value.Alt.li) ? value.Alt.li : [value.Alt.li];
    const preferred = items.find(item => object(item) && item['@_lang'] === 'x-default');
    return textValues(preferred ?? items[0]);
  }
  if ('#text' in value) return textValues(value['#text']);
  return Object.entries(value).filter(([key]) => !key.startsWith('@_')).flatMap(([, child]) => textValues(child));
}
function findProperty(value: unknown, names: string[]): string[] {
  if (Array.isArray(value)) {
    for (const child of value) { const found = findProperty(child, names); if (found.length) return found; }
  } else if (object(value)) {
    for (const name of names) {
      const found = textValues(value[name] ?? value[`@_${name}`]);
      if (found.length) return found;
    }
    for (const child of Object.values(value)) { const found = findProperty(child, names); if (found.length) return found; }
  }
  return [];
}
export function parseXmp(xml: string): PdfMetadata {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('XMP メタデータの XML が不正です。');
  const tree: unknown = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, processEntities: false }).parse(xml);
  const doi = findProperty(tree, ['doi', 'DOI'])[0] ?? findProperty(tree, ['identifier']).find(value => /^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/|10\.\d{4,9}\/)/i.test(value)) ?? '';
  return {
    title: findProperty(tree, ['title'])[0] ?? '',
    authors: findProperty(tree, ['creator']),
    // CreateDate, ModifyDate and dc:date are not evidence of a publication date.
    publicationDate: findProperty(tree, ['publicationDate', 'coverDate', 'PublicationDate', 'PublicationYear'])[0] ?? '',
    journal: findProperty(tree, ['publicationName'])[0] ?? '',
    doi,
  };
}

function bibText(value: string): string {
  const escapes: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
  return value.replace(/[\\{}&%$#_~^]/g, char => escapes[char]!).replace(/[\p{Cc}\p{Cf}]+/gu, ' ').trim();
}
export function metadataToBib(metadata: PdfMetadata, language?: string): Conversion {
  const fields: Record<string, string> = {};
  if (metadata.title) fields.title = bibText(metadata.title);
  if (metadata.authors.length) fields.author = metadata.authors.map(author => {
    const escaped = bibText(author);
    return /\band\b/i.test(author) ? `{${escaped}}` : escaped;
  }).join(' and ');
  const date = metadata.publicationDate.trim().match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?(?=$|T|\s)/)?.[0];
  if (date) fields.date = date;
  if (metadata.journal) fields.journaltitle = bibText(metadata.journal);
  if (metadata.doi) fields.doi = metadata.doi.replace(/[\\{}\p{Cc}]/gu, char => encodeURIComponent(char));
  const type = metadata.journal ? 'article' : 'misc';
  const input = `@${type}{,\n${Object.entries(fields).map(([name, value]) => `  ${name} = {${value}},`).join('\n')}\n}`;
  const conversion = convertBib(input, { language });
  if (!date) conversion.warnings.push('PDF に出版日がありません。PDF の作成日・更新日を出版年の代わりには使用していません。');
  return conversion;
}

export async function convertPdf(bytes: Uint8Array, { language }: { language?: string } = {}): Promise<Conversion> {
  let document: PDFDocument;
  try { document = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (error) {
    if (error instanceof Error && /encrypted/i.test(error.message)) throw new Error('暗号化された PDF は読み込めません。暗号化されていない PDF を選択してください。');
    throw new Error('PDF を読み込めません。ファイルが有効な PDF か確認してください。');
  }
  const info = document.context.trailerInfo.Info;
  const dictionary = info ? document.context.lookup(info) : undefined;
  function infoText(...names: string[]): string {
    if (!(dictionary instanceof PDFDict)) return '';
    for (const name of names) {
      const value = dictionary.lookup(PDFName.of(name));
      if (value instanceof PDFString || value instanceof PDFHexString) {
        const text = value.decodeText().replace(/\s+/g, ' ').trim();
        if (text) return text;
      }
    }
    return '';
  }
  const metadata: PdfMetadata = {
    title: infoText('Title'),
    authors: infoText('Author').split(/\s*;\s*|\s+and\s+/i).map(name => name.trim()).filter(Boolean),
    publicationDate: infoText('PublicationDate', 'PublicationYear', 'Year'),
    journal: infoText('Journal', 'PublicationName'), doi: infoText('DOI', 'doi'),
  };
  let xmpWarning = '';
  const stream = document.catalog.lookup(PDFName.of('Metadata'));
  if (stream instanceof PDFRawStream) {
    try {
      const xmp = parseXmp(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
      const placeholder = /^(?:LaTeX(?: with hyperref)?|untitled|Microsoft (?:Word|PowerPoint).*)$/i;
      metadata.title = xmp.title && !placeholder.test(xmp.title) ? xmp.title : metadata.title;
      metadata.authors = xmp.authors.length && !xmp.authors.some(author => placeholder.test(author)) ? xmp.authors : metadata.authors;
      metadata.publicationDate = xmp.publicationDate || metadata.publicationDate;
      metadata.journal = xmp.journal || metadata.journal;
      metadata.doi = xmp.doi || metadata.doi;
    } catch { xmpWarning = 'XMP メタデータを読み込めなかったため、PDF の文書情報から作成しました。'; }
  }
  if (/^(?:LaTeX(?: with hyperref)?|untitled|Microsoft (?:Word|PowerPoint).*)$/i.test(metadata.title)) metadata.title = '';
  metadata.authors = metadata.authors.filter(author => !/^LaTeX(?: with hyperref)?$/i.test(author));
  metadata.authors = metadata.authors.flatMap(japaneseAuthorList);
  const conversion = metadataToBib(metadata, language);
  if (xmpWarning) conversion.warnings.push(xmpWarning);
  return conversion;
}
