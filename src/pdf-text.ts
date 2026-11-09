import type { PdfMetadata } from './pdf';

declare const __PDF_WORKER_SOURCE__: string;
export interface PdfLine { text: string; size: number; top: number }
declare const __PDF_ASSETS__: Record<string, string>;
class InlinePdfAssets {
  async fetch({ filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const encoded = __PDF_ASSETS__[filename];
    if (!encoded) throw new Error(`PDF の文字マップがありません: ${filename}`);
    return Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  }
}
let workerUrl: string | undefined;

export async function firstPageLines(bytes: Uint8Array): Promise<PdfLine[]> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') throw new Error('PDF 本文の読み取りにはブラウザが必要です。');
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  workerUrl ??= URL.createObjectURL(new Blob([__PDF_WORKER_SOURCE__], { type: 'text/javascript' }));
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({ data: bytes.slice(), useWasm: false, useSystemFonts: true, disableFontFace: true, useWorkerFetch: false, BinaryDataFactory: InlinePdfAssets });
  try {
    const document = await task.promise;
    const page = await document.getPage(1);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    const rows: { y: number; size: number; segments: { x: number; width: number; text: string }[] }[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = item.transform[5] ?? 0;
      const x = item.transform[4] ?? 0;
      const size = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0);
      const row = rows.find(row => Math.abs(row.y - y) < Math.max(2, size * .25));
      if (row) { row.size = Math.max(row.size, size); row.segments.push({ x, width: item.width, text: item.str }); }
      else rows.push({ y, size, segments: [{ x, width: item.width, text: item.str }] });
    }
    return rows.sort((a, b) => b.y - a.y).map(row => {
      const segments = row.segments.sort((a, b) => a.x - b.x);
      let text = '';
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!;
        const previous = segments[i - 1];
        const gap = previous ? segment.x - previous.x - previous.width : 0;
        text += (previous && gap > row.size * .9 ? '  ' : previous && gap > row.size * .15 ? ' ' : '') + segment.text;
      }
      return { text: text.trim(), size: row.size, top: (height - row.y) / height };
    });
  } finally { await task.destroy(); }
}

export function japaneseAuthorList(value: string): string[] {
  const parts = value.split(/[,、，]\s*/);
  const japaneseFullName = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々]+[\s　]+[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々]+$/u;
  if (parts.length > 1 && parts.every(part => japaneseFullName.test(part.trim()))) return parts.map(part => part.trim().replace(/[\s　]+/u, ', '));
  if (japaneseFullName.test(value.trim())) return [value.trim().replace(/[\s　]+/u, ', ')];
  return [value];
}

// Limit inference to the first-page heading, never reference lists or arbitrary body years.
export function inferHeading(lines: PdfLine[]): Partial<PdfMetadata> {
  const heading = lines.filter(line => line.top < .36 && line.text.trim());
  const result: Partial<PdfMetadata> = {};
  const publicationLine = heading.find(line => line.top < .18 && /(?:年次大会|論文集|学会誌|proceedings|conference|published|©|copyright)/i.test(line.text) && /(?:19|20)\d{2}/.test(line.text));
  const date = publicationLine?.text.match(/((?:19|20)\d{2})\s*[年/-]?\s*(\d{1,2})?\s*月?/);
  if (date) result.publicationDate = date[1] + (date[2] && +date[2] >= 1 && +date[2] <= 12 ? `-${date[2].padStart(2, '0')}` : '');
  if (publicationLine && /(?:発表論文集|proceedings|conference)/i.test(publicationLine.text)) result.booktitle = publicationLine.text.replace(/[（(]\s*(?:19|20)\d{2}[^）)]*[）)]/g, '').trim();
  const titleCandidates = heading.filter(line => line.top > .035 && line.text.length >= 6 && !/(?:@|https?:|年次大会|proceedings|copyright|^abstract$|^概要$)/i.test(line.text));
  const largest = Math.max(...titleCandidates.map(line => line.size));
  const titleLines = titleCandidates.filter(line => line.size >= largest * .96 && line.top < .24);
  if (!titleLines.length) return result;
  result.title = titleLines.map(line => line.text).join(/[\p{Script=Han}\p{Script=Hiragana}]/u.test(titleLines[0]!.text) ? '' : ' ');
  const lastTitle = titleLines[titleLines.length - 1]!;
  const authorLine = heading.find(line => line.top > lastTitle.top + .005 && line.top < lastTitle.top + .065 && !/(?:@|大学|university|institute|^abstract$|^概要$)/i.test(line.text));
  if (authorLine) {
    const names = authorLine.text.replace(/[\d¹²³⁴⁵⁶⁷⁸⁹⁰,*†‡]/g, ' ').trim();
    const japanese = names.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々]+[\s　]+[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々]+/gu);
    result.authors = japanese?.length ? japanese.flatMap(japaneseAuthorList) : names.split(/\s{2,}|\s+and\s+|;/i).map(name => name.trim()).filter(Boolean);
  }
  return result;
}
