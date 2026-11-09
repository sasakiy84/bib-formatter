import { convertPdf } from './pdf';
import { convertBib, type Conversion } from './formatter';
import { exampleBib } from './examples';

function element<T extends HTMLElement>(id: string, kind: { new(): T }): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`Missing element: ${id}`);
  return found;
}
const source = element('source', HTMLTextAreaElement);
const output = element('output', HTMLTextAreaElement);
const status = element('status', HTMLParagraphElement);
const warnings = element('warnings', HTMLUListElement);
const filenames = element('filenames', HTMLDivElement);
const copy = element('copy', HTMLButtonElement);
const download = element('download', HTMLButtonElement);
const copyNames = element('copy-names', HTMLButtonElement);
let result: Conversion | undefined;
let inputRevision = 0;

function invalidate(): void {
  inputRevision++;
  result = undefined;
  output.value = '';
  filenames.replaceChildren();
  warnings.replaceChildren();
  copy.disabled = download.disabled = copyNames.disabled = true;
  status.textContent = '';
}
async function copyText(text: string, fallback: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'コピーしました。';
  } catch {
    fallback.focus(); fallback.select();
    status.textContent = 'コピーする内容を選択しました。Ctrl+C / ⌘C でコピーしてください。';
  }
}
source.addEventListener('input', invalidate);
element('example', HTMLButtonElement).addEventListener('click', () => { source.value = exampleBib; invalidate(); source.focus(); source.setSelectionRange(0, 0); source.scrollTop = 0; });
element('clear', HTMLButtonElement).addEventListener('click', () => { source.value = ''; invalidate(); source.focus(); });
function displayResult(conversion: Conversion): void {
  result = conversion;
  output.value = result.bib;
  const removedCount = result.entries.reduce((sum, entry) => sum + entry.removed.length, 0);
  status.textContent = `${result.entries.length}件を変換しました。${removedCount}個の不要なフィールドを削除しました。`;
  const messages = [...result.warnings, ...result.entries.filter(entry => entry.removed.length).map(entry => `${entry.key}: 削除したフィールド — ${entry.removed.join(', ')}`)];
  for (const message of messages) { const li = document.createElement('li'); li.textContent = message; warnings.append(li); }
  for (const entry of result.entries) {
    const row = document.createElement('div'); row.className = 'filename-row';
    const label = document.createElement('label'); label.textContent = entry.key;
    const input = document.createElement('input'); input.readOnly = true; input.value = entry.filename;
    input.addEventListener('click', () => input.select());
    label.append(input);
    const button = document.createElement('button'); button.textContent = 'コピー'; button.type = 'button'; button.setAttribute('aria-label', `${entry.key} のファイル名をコピー`);
    button.addEventListener('click', () => void copyText(entry.filename, input));
    row.append(label, button); filenames.append(row);
  }
  copy.disabled = download.disabled = copyNames.disabled = false;
}
element('file', HTMLInputElement).addEventListener('change', async event => {
  if (!(event.currentTarget instanceof HTMLInputElement)) return;
  const fileInput = event.currentTarget;
  const file = fileInput.files?.[0];
  if (!file) return;
  fileInput.value = '';
  invalidate();
  const revision = inputRevision;
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  status.textContent = isPdf ? 'PDF のメタデータを読み込んでいます…' : 'ファイルを読み込んでいます…';
  try {
    if (isPdf) {
      const conversion = await convertPdf(new Uint8Array(await file.arrayBuffer()));
      if (revision !== inputRevision) return;
      source.value = conversion.bib;
      displayResult(conversion);
    } else {
      const text = await file.text();
      if (revision !== inputRevision) return;
      source.value = text;
      status.textContent = '読み込みました。「biblatex に変換」を押してください。';
    }
  } catch (error) {
    if (revision === inputRevision) status.textContent = `読み込めませんでした: ${error instanceof Error ? error.message : String(error)}`;
  }
});
element('convert', HTMLButtonElement).addEventListener('click', () => {
  invalidate();
  try { displayResult(convertBib(source.value)); }
  catch (error) { status.textContent = `変換できませんでした: ${error instanceof Error ? error.message : String(error)}`; }
});
source.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') element('convert', HTMLButtonElement).click();
});
copy.addEventListener('click', () => { if (result) void copyText(result.bib, output); });
copyNames.addEventListener('click', async () => {
  if (!result) return;
  const text = result.entries.map(entry => entry.filename).join('\n');
  try { await navigator.clipboard.writeText(text); status.textContent = 'ファイル名をすべてコピーしました。'; }
  catch { status.textContent = 'クリップボードを利用できません。各ファイル名を選択してコピーしてください。'; }
});
download.addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([result.bib], { type: 'application/x-bibtex;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'formatted.bib'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
