import { convertPdf } from './pdf';
import { addCommonField, commonFields, changeEntryType, convertBib, type Conversion } from './formatter';
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
const fieldTools = element('field-tools', HTMLDivElement);
const entryTools = element('entry-tools', HTMLDivElement);
const fieldButtons = element('field-buttons', HTMLDivElement);
let result: Conversion | undefined;
let inputRevision = 0;

function invalidate(preserveOutput = false): void {
  inputRevision++;
  result = undefined;
  if (!preserveOutput) output.value = '';
  fieldTools.hidden = true;
  fieldButtons.replaceChildren();
  entryTools.replaceChildren();
  filenames.replaceChildren();
  warnings.replaceChildren();
  copy.disabled = download.disabled = copyNames.disabled = true;
  status.textContent = '';
}
async function copyText(text: string, fallback: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = '';
  } catch {
    fallback.focus(); fallback.select();
    status.textContent = 'コピーする内容を選択しました。Ctrl+C / ⌘C でコピーしてください。';
  }
}
function sourceChanged(): void {
  inputRevision++;
  if (!output.value.trim()) invalidate(true);
  else status.textContent = '';
}
let pasteIntoEmptyOutput = false;
source.addEventListener('paste', () => { pasteIntoEmptyOutput = !output.value.trim(); });
source.addEventListener('input', event => {
  sourceChanged();
  const shouldConvert = pasteIntoEmptyOutput && event instanceof InputEvent && event.inputType === 'insertFromPaste';
  pasteIntoEmptyOutput = false;
  if (shouldConvert) convertSource();
});
output.addEventListener('input', () => {
  const text = output.value;
  invalidate(true);
  if (!text.trim()) return;
  try {
    const updated = convertBib(text, { generateKeys: false });
    displayResult({ ...updated, bib: text }, false);

  } catch (error) { status.textContent = `編集中: ${error instanceof Error ? error.message : String(error)}`; }
});
element('example', HTMLButtonElement).addEventListener('click', () => { source.value = exampleBib; sourceChanged(); source.focus(); source.setSelectionRange(0, 0); source.scrollTop = 0; });
element('clear', HTMLButtonElement).addEventListener('click', () => { source.value = ''; invalidate(); source.focus(); });
function displayResult(conversion: Conversion, writeOutput = true): void {
  result = conversion;
  if (writeOutput) output.value = result.bib;
  filenames.replaceChildren();
  warnings.replaceChildren();
  fieldButtons.replaceChildren();
  entryTools.replaceChildren();
  fieldTools.hidden = result.entries.length !== 1;
  const singleEntry = result.entries.length === 1 ? result.entries[0] : undefined;
  if (singleEntry) {
    for (const [field, label] of commonFields) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = `${label}を追加`; button.title = field;
      button.disabled = singleEntry.fields[field] !== undefined;
      if (field === 'date' && singleEntry.fields.year !== undefined) button.disabled = true;
      button.addEventListener('click', () => {
        if (!result) return;
        try {
          const updated = addCommonField(result.bib, field);
          invalidate(); displayResult(updated);
          const caret = output.value.indexOf(`  ${field} = {`) + `  ${field} = {`.length;
          output.focus(); output.setSelectionRange(caret, caret);

        } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      });
      fieldButtons.append(button);
    }
  }
  status.textContent = '';
  const messages = result.warnings;
  for (const message of messages) { const li = document.createElement('li'); li.textContent = message; warnings.append(li); }
  for (const [entryIndex, entry] of result.entries.entries()) {
    const displayKey = entry.key || (result.entries.length === 1 ? 'キーなし' : `キーなし（文献${entryIndex + 1}）`);
    const controls = document.createElement('div'); controls.className = 'toolbar';
    const typeLabel = document.createElement('label'); typeLabel.textContent = result.entries.length === 1 ? '文献種別 ' : `${displayKey} の文献種別 `;
    const typeSelect = document.createElement('select'); typeSelect.setAttribute('aria-label', `${displayKey} の文献種別`); typeSelect.dataset.entryIndex = String(entryIndex);
    const choices: [string, string][] = [['article', '雑誌論文'], ['inproceedings', '会議論文'], ['book', '書籍'], ['incollection', '書籍の章'], ['phdthesis', '博士論文'], ['mathesis', '修士論文'], ['thesis', 'その他の学位論文'], ['report', '報告書'], ['online', 'Webページ'], ['unpublished', '未刊行資料'], ['misc', 'その他・未分類']];
    const selected = entry.type === 'thesis' && ['phdthesis', 'mathesis'].includes(entry.fields.type ?? '') ? entry.fields.type! : entry.type;
    if (!choices.some(([type]) => type === selected)) choices.push([selected, `その他の種別（${selected}）`]);
    for (const [value, text] of choices) { const option = document.createElement('option'); option.value = value; option.textContent = text; typeSelect.append(option); }
    typeSelect.value = selected;
    typeLabel.append(typeSelect);
    const changeType = document.createElement('button'); changeType.textContent = '種別を変更'; changeType.setAttribute('aria-label', `${displayKey} の種別を変更`);
    changeType.addEventListener('click', () => {
      if (!result) return;
      try {
        const updated = changeEntryType(result.bib, entry.key, typeSelect.value, entryIndex);
        updated.warnings = [...new Set([...result.warnings, ...updated.warnings])];
        for (const [index, changed] of updated.entries.entries()) changed.removed = result.entries[index]?.removed ?? [];
        source.value = updated.bib;
        invalidate(); displayResult(updated);

        const nextSelect = [...document.querySelectorAll<HTMLSelectElement>('select')].find(select => select.dataset.entryIndex === String(entryIndex));
        nextSelect?.focus();
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    });
    controls.append(typeLabel, changeType);
    const row = document.createElement('div'); row.className = 'filename-row';
    entryTools.append(controls);
    const label = document.createElement('label'); label.textContent = displayKey;
    const input = document.createElement('input'); input.readOnly = true; input.value = entry.filename;
    input.id = `filename-${filenames.children.length}`; label.htmlFor = input.id;
    input.addEventListener('click', () => input.select());
    const button = document.createElement('button'); button.textContent = 'コピー'; button.type = 'button'; button.setAttribute('aria-label', `${displayKey} のファイル名をコピー`);
    button.addEventListener('click', () => void copyText(entry.filename, input));
    row.append(input, button);
    const group = document.createElement('div'); group.className = 'filename-entry'; group.append(label, row); filenames.append(group);
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
      status.textContent = '';
    }
  } catch (error) {
    if (revision === inputRevision) status.textContent = `読み込めませんでした: ${error instanceof Error ? error.message : String(error)}`;
  }
});
function convertSource(): void {
  invalidate();
  try { displayResult(convertBib(source.value)); }
  catch (error) { status.textContent = `変換できませんでした: ${error instanceof Error ? error.message : String(error)}`; }
}
element('convert', HTMLButtonElement).addEventListener('click', convertSource);
source.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') element('convert', HTMLButtonElement).click();
});
copy.addEventListener('click', () => { if (result) void copyText(result.bib, output); });
copyNames.addEventListener('click', async () => {
  if (!result) return;
  const text = result.entries.map(entry => entry.filename).join('\n');
  try { await navigator.clipboard.writeText(text); status.textContent = ''; }
  catch { status.textContent = 'クリップボードを利用できません。各ファイル名を選択してコピーしてください。'; }
});
download.addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([result.bib], { type: 'application/x-bibtex;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'formatted.bib'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
