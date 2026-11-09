import { mkdir } from 'node:fs/promises';
const result = await Bun.build({ entrypoints: ['./src/app.ts'], target: 'browser', format: 'esm', minify: true });
if (!result.success) throw new AggregateError(result.logs, 'Build failed');
const script = await result.outputs[0]!.text();
let template = await Bun.file('src/index.html').text();
// Retain third-party notices inside the standalone distribution.
const licenses: string[] = [];
for await (const path of new Bun.Glob('node_modules/**/{LICENSE,LICENSE.*,LICENCE,license,license.*}').scan({ onlyFiles: true })) {
  licenses.push(`${path}\n\n${await Bun.file(path).text()}`);
}
const notice = licenses.sort().join('\n\n----------------------------------------\n\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
template = template.replace('<!-- LICENSES -->', `<details><summary>Third-party licenses</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${notice}</pre></details>`);
await mkdir('dist', { recursive: true });
await Bun.write('dist/index.html', template.replace('<!-- APP_SCRIPT -->', () => `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>`));
console.log(`dist/index.html (${Bun.file('dist/index.html').size} bytes): self-contained HTML`);
