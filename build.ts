import { mkdir } from 'node:fs/promises';
const worker = await Bun.build({ entrypoints: ['./node_modules/pdfjs-dist/build/pdf.worker.mjs'], target: 'browser', format: 'esm', minify: true, external: ['node:module', 'node:fs', 'node:fs/promises', 'node:url'] });
if (!worker.success) throw new AggregateError(worker.logs, 'PDF worker build failed');
const workerSource = await worker.outputs[0]!.text();
const pdfAssets: Record<string, string> = {};
for (const directory of ['cmaps', 'standard_fonts']) {
  for await (const path of new Bun.Glob(`node_modules/pdfjs-dist/${directory}/*`).scan({ onlyFiles: true })) {
    if (/\.(bcmap|pfb|ttf)$/.test(path)) pdfAssets[path.split('/').at(-1)!] = Buffer.from(await Bun.file(path).arrayBuffer()).toString('base64');
  }
}
const result = await Bun.build({ entrypoints: ['./src/app.ts'], target: 'browser', format: 'esm', minify: true, external: ['node:module', 'node:fs', 'node:fs/promises', 'node:url'], define: { __PDF_WORKER_SOURCE__: JSON.stringify(workerSource), __PDF_ASSETS__: JSON.stringify(pdfAssets) } });
if (!result.success) throw new AggregateError(result.logs, 'Build failed');
const script = await result.outputs[0]!.text();
let template = await Bun.file('src/index.html').text();
// Retain third-party notices inside the standalone distribution.
const licenses: string[] = [];
for await (const path of new Bun.Glob('node_modules/**/{LICENSE,LICENSE.*,LICENCE,license,license.*}').scan({ onlyFiles: true })) {
  licenses.push(`${path}\n\n${await Bun.file(path).text()}`);
}
const notice = licenses.sort().join('\n\n----------------------------------------\n\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
template = template.replace('</footer>', `</footer><details><summary>Third-party licenses</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${notice}</pre></details>`);
await mkdir('dist', { recursive: true });
await Bun.write('dist/index.html', template.replace('<!-- APP_SCRIPT -->', () => `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>`));
console.log(`dist/index.html (${Bun.file('dist/index.html').size} bytes): self-contained HTML`);
