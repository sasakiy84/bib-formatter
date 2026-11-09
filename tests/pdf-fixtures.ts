import { PDFDocument, PDFName, PDFHexString, PDFDict } from 'pdf-lib';

export async function makePdf(options: { title?: string; author?: string; year?: string; xmp?: string } = {}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage();
  if (options.title) document.setTitle(options.title);
  if (options.author) document.setAuthor(options.author);
  document.setCreationDate(new Date('1999-01-01T00:00:00Z'));
  const info = document.context.lookup(document.context.trailerInfo.Info);
  if (options.year && info instanceof PDFDict) info.set(PDFName.of('PublicationYear'), PDFHexString.fromText(options.year));
  if (options.xmp) {
    const stream = document.context.flateStream(new TextEncoder().encode(options.xmp), { Type: 'Metadata', Subtype: 'XML' });
    document.catalog.set(PDFName.of('Metadata'), document.context.register(stream));
  }
  return document.save();
}
export const englishXmp = `<?xpacket begin="﻿"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/">
<dc:title><rdf:Alt><rdf:li xml:lang="ja">日本語タイトル</rdf:li><rdf:li xml:lang="x-default">An English PDF Study</rdf:li></rdf:Alt></dc:title>
<dc:creator><rdf:Seq><rdf:li>Smith, Jane</rdf:li><rdf:li>Jones, Alex</rdf:li><rdf:li>Lee, Sam</rdf:li><rdf:li>Brown, Chris</rdf:li></rdf:Seq></dc:creator>
<prism:publicationDate>2024-06-15</prism:publicationDate>
<prism:publicationName>Journal of Examples</prism:publicationName>
<prism:doi>https://doi.org/10.1234/pdf_test</prism:doi>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
