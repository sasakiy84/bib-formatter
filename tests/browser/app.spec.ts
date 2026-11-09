import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`LLM prompt tab copies instructions and preserves edited bib at ${width}px`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const editedBib = '@book{夏目1914, author={夏目, 漱石}, title={こころ}, date={1914}}';
    await page.getByRole('textbox', { name: '変換した biblatex' }).fill(editedBib);
    const converterTab = page.getByRole('tab', { name: '変換', exact: true });
    const promptTab = page.getByRole('tab', { name: 'LLM用プロンプト', exact: true });
    await promptTab.click();
    await expect(promptTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: '変換', exact: true })).not.toBeVisible();
    const prompt = page.getByRole('textbox', { name: 'LLM用プロンプト', exact: true });
    await expect(prompt).toHaveValue(/^以下の書誌情報をルールに則って biblatex フォーマットにして、コードブロックで出力してください。/);
    await page.getByRole('button', { name: 'プロンプトをコピー', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await prompt.inputValue());
    await page.screenshot({ path: `test-results/prompt-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await promptTab.focus();
    await promptTab.press('ArrowRight');
    await expect(converterTab).toBeFocused();
    await expect(converterTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(editedBib);
    await expect(page.getByLabel('夏目1914', { exact: true })).toHaveValue('1914_夏目_こころ');
    await converterTab.press('End');
    await expect(promptTab).toBeFocused();
    await promptTab.press('Home');
    await expect(converterTab).toBeFocused();
  });
}

for (const width of [1280, 390]) {
  test(`sample converts, downloads and stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await page.getByRole('button', { name: 'biblatex に変換' }).click();
    await expect(page.getByLabel('nakaya1938', { exact: true })).toHaveValue('1938_中谷_雪');
    await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/journaltitle =/);
    await expect(page.getByLabel('nakaya1938', { exact: true })).toHaveValue('1938_中谷_雪');
    await expect(page.getByLabel('sample2024', { exact: true })).toHaveValue('2024_Smith-Jones-Lee-et-al_A-Sample-Study-of-AI-Tools');
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '.bib を保存' }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toBe('formatted.bib');
    await page.screenshot({ path: `test-results/screen-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test('source edits preserve output until explicit conversion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '入力する .bib' }).fill('@misc{x,title={Valid},year=2024}');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByRole('button', { name: '結果をコピー' })).toBeEnabled();
  await page.getByRole('textbox', { name: '入力する .bib' }).fill('@article{broken');
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/Valid/);
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue('');
  await expect(page.getByRole('button', { name: '結果をコピー' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('変換できませんでした');
});
test('uploaded Japanese bibliography and keyboard conversion work', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'japanese.bib', mimeType: 'text/plain', buffer: Buffer.from('@book{jp,author={夏目, 漱石},title={こころ},year=1914,publisher={岩波書店}}') });
  await expect(page.getByRole('textbox', { name: '入力する .bib' })).toHaveValue(/夏目/);
  await page.getByRole('textbox', { name: '入力する .bib' }).press('Control+Enter');
  await expect(page.getByLabel('jp', { exact: true })).toHaveValue('1914_夏目_こころ');
});
test('copies an individual filename without whitespace', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'サンプルを入力' }).click();
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await page.getByRole('button', { name: 'sample2024 のファイル名をコピー', exact: true }).click();
  await expect(page.getByRole('status')).not.toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2024_Smith-Jones-Lee-et-al_A-Sample-Study-of-AI-Tools');
});
test('built HTML works offline as a local file without subresource requests', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await context.setOffline(true);
  await page.goto(new URL('../../dist/index.html', import.meta.url).href);
  await page.getByRole('button', { name: 'サンプルを入力' }).click();
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByLabel('nakaya1938', { exact: true })).toHaveValue('1938_中谷_雪');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatch(/^file:/);
});

for (const width of [1280, 390]) {
  test(`PDF upload produces bib and a copyable filename at ${width}px`, async ({ page, context }) => {
    const { makePdf, englishXmp } = await import('../pdf-fixtures');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf({ xmp: englishXmp })) });
    await expect(page.getByLabel('Smith2024', { exact: true })).toHaveValue('2024_Smith-Jones-Lee-et-al_An-English-PDF-Study');
    await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/journaltitle = \{Journal of Examples\}/);
    await expect(page.getByLabel('Smith2024', { exact: true })).toHaveValue('2024_Smith-Jones-Lee-et-al_An-English-PDF-Study');
    await page.getByRole('button', { name: 'Smith2024 のファイル名をコピー', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2024_Smith-Jones-Lee-et-al_An-English-PDF-Study');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '.bib を保存' }).click();
    expect((await pending).suggestedFilename()).toBe('formatted.bib');
    await page.screenshot({ path: `test-results/pdf-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test('PDF without publication date shows missing information and allows correction', async ({ page }) => {
  const { makePdf } = await import('../pdf-fixtures');
  await page.goto('/');
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: '日本語.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf({ title: '日本語の研究', author: '佐藤, 花子' })) });
  await expect(page.getByLabel('キーなし', { exact: true })).toHaveValue('nd_佐藤_日本語の研究');
  await expect(page.getByLabel('確認する項目')).toContainText('PDF に出版日がありません');
  const source = page.getByRole('textbox', { name: '入力する .bib' });
  await source.fill((await source.inputValue()).replace('@misc{,', '@misc{,\n  date = {2025},'));
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByLabel('佐藤2025', { exact: true })).toHaveValue('2025_佐藤_日本語の研究');
});
test('corrupt PDF clears old results and shows an error', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'サンプルを入力' }).click();
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(page.getByRole('status')).toContainText('PDF を読み込めません');
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue('');
  await expect(page.getByRole('button', { name: '結果をコピー' })).toBeDisabled();
});
test('PDF conversion works in the standalone offline HTML', async ({ page, context }) => {
  const { makePdf } = await import('../pdf-fixtures');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await context.setOffline(true);
  await page.goto(new URL('../../dist/index.html', import.meta.url).href);
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'offline.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf({ title: 'Offline Study', author: 'Smith, Jane', year: '2024' })) });
  await expect(page.getByLabel('Smith2024', { exact: true })).toHaveValue('2024_Smith_Offline-Study');
  expect(requests).toHaveLength(1);
});
test('Japanese type controls update the selected bibliography entry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'サンプルを入力' }).click();
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await page.getByRole('combobox', { name: 'nakaya1938 の文献種別' }).selectOption({ label: '博士論文' });
  await page.getByRole('button', { name: 'nakaya1938 の種別を変更', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/@thesis\{nakaya1938,/);
  await expect(page.getByRole('textbox', { name: '入力する .bib' })).toHaveValue(/type = \{phdthesis\}/);
  await expect(page.getByRole('combobox', { name: 'turing1936 の文献種別' })).toHaveValue('article');
  await expect(page.getByRole('combobox', { name: 'nakaya1938 の文献種別' })).toBeFocused();
  await page.screenshot({ path: 'test-results/type-controls.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('editing the output updates filenames and copies the exact edited bib', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const edited = '@article{edited, author={Jones, Alex}, title={Edited English Title}, date={2026}}';
  await page.getByRole('textbox', { name: '変換した biblatex' }).fill(edited);
  await expect(page.getByLabel('edited', { exact: true })).toHaveValue('2026_Jones_Edited-English-Title');
  await page.getByRole('button', { name: '結果をコピー', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(edited);
});
test('editing malformed output retains the draft and recovers filenames after correction', async ({ page }) => {
  await page.goto('/');
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  const broken = '@misc{draft,title={Unclosed';
  await output.fill(broken);
  await expect(output).toHaveValue(broken);
  await expect(page.getByRole('status')).toContainText('編集中');
  await expect(page.getByRole('button', { name: '結果をコピー', exact: true })).toBeDisabled();
  await output.press('End');
  await output.pressSequentially('}}');
  await expect(page.getByLabel('draft', { exact: true })).toHaveValue('nd_Unknown_Unclosed');
});
test('single-entry field buttons insert a field and place the caret in its value', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await output.fill('@misc{x,title={Editable},author={Smith, Jane}}');
  await expect(page.getByRole('button', { name: 'タイトルを追加', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '出版年月日を追加', exact: true }).click();
  await expect(output).toBeFocused();
  await output.pressSequentially('2027');
  await expect(page.getByLabel('x', { exact: true })).toHaveValue('2027_Smith_Editable');
  await expect(page.getByRole('button', { name: '出版年月日を追加', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/editing-fields-390.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('field-addition controls are hidden for multiple bibliography entries', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '変換した biblatex' }).fill('@misc{x,title={X}} @misc{y,title={Y}}');
  await expect(page.getByRole('button', { name: 'DOIを追加', exact: true })).toHaveCount(0);
});
test('pasting on the left auto-converts only when the output is empty', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const source = page.getByRole('textbox', { name: '入力する .bib' });
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await page.evaluate(() => navigator.clipboard.writeText('@misc{pasted,title={Pasted Title},year=2024}'));
  await source.focus();
  await source.press('Control+V');
  await expect(page.getByLabel('pasted', { exact: true })).toHaveValue('2024_Unknown_Pasted-Title');
  await output.fill('@misc{edited,title={Keep My Edits},year=2025}');
  await source.focus();
  await source.press('Control+A');
  await page.evaluate(() => navigator.clipboard.writeText('@misc{another,title={Another Title},year=2026}'));
  await source.press('Control+V');
  await expect(source).toHaveValue(/Another Title/);
  await expect(output).toHaveValue('@misc{edited,title={Keep My Edits},year=2025}');
  await expect(page.getByLabel('edited', { exact: true })).toHaveValue('2025_Unknown_Keep-My-Edits');
});
for (const width of [1280, 390]) {
  test(`editing controls stay beside output and filename rows align at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await page.getByRole('button', { name: 'biblatex に変換' }).click();
    await expect(page.getByRole('status')).not.toBeVisible();
    const editor = page.getByRole('region', { name: '変換した biblatex' });
    await expect(editor.getByRole('combobox', { name: 'nakaya1938 の文献種別' })).toBeVisible();
    await editor.getByRole('combobox', { name: 'nakaya1938 の文献種別' }).selectOption({ label: '雑誌論文' });
    await editor.getByRole('button', { name: 'nakaya1938 の種別を変更', exact: true }).click();
    await expect(page.getByRole('status')).not.toBeVisible();
    const type = await editor.getByRole('combobox', { name: 'nakaya1938 の文献種別' }).boundingBox();
    const change = await editor.getByRole('button', { name: 'nakaya1938 の種別を変更', exact: true }).boundingBox();
    if (!type || !change) throw new Error('Type controls not visible');
    expect(Math.abs(type.y - change.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(type.height - change.height)).toBeLessThanOrEqual(1);
    const files = page.getByRole('region', { name: 'ファイル名', exact: true });
    await expect(files.getByRole('combobox')).toHaveCount(0);
    await expect(files).not.toContainText('Year_Authors_Title');
    for (const key of ['turing1936', 'nakaya1938', 'sample2024']) {
      const input = await page.getByLabel(key, { exact: true }).boundingBox();
      const button = await page.getByRole('button', { name: `${key} のファイル名をコピー`, exact: true }).boundingBox();
      if (!input || !button) throw new Error('Filename controls not visible');
      expect(Math.abs(input.y - button.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(input.height - button.height)).toBeLessThanOrEqual(1);
    }
    if (width > 700) {
      const source = await page.getByRole('textbox', { name: '入力する .bib' }).boundingBox();
      const output = await page.getByRole('textbox', { name: '変換した biblatex' }).boundingBox();
      if (!source || !output) throw new Error('Editors not visible');
      expect(Math.abs(source.y - output.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(source.height - output.height)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: `test-results/aligned-controls-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('PDF import reads metadata without inferring missing fields from the first page', async ({ page }) => {
  const { makePdf } = await import('../pdf-fixtures');
  await page.goto('/');
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'metadata-only.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf({ title: 'Known Title', author: 'Smith, Jane', text: [
    { text: 'Example Conference (2025)', x: 80, y: 810, size: 10 },
    { text: 'A Different Paper Title', x: 80, y: 740, size: 18 },
  ] })) });
  await expect(page.getByLabel('キーなし', { exact: true })).toHaveValue('nd_Smith_Known-Title');
  await expect(page.getByRole('combobox', { name: 'キーなし の文献種別' })).toHaveValue('misc');
});
test('converts an empty key to the first author surname and year', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '入力する .bib' }).fill('@inproceedings{, author={山田, 太郎 and 鈴木, 花子}, title={架空の研究}, date={2026-03}}');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/^@inproceedings\{山田2026,/);
  await expect(page.getByLabel('山田2026', { exact: true })).toHaveValue('2026_山田-鈴木_架空の研究');
});
test('unnamed entries keep empty keys and support separate type edits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '入力する .bib' }).fill('@misc{,title={First}} @misc{,title={Second}}');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await page.getByRole('combobox', { name: 'キーなし（文献2） の文献種別' }).selectOption('book');
  await page.getByRole('button', { name: 'キーなし（文献2） の種別を変更', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/@misc\{,[\s\S]*@book\{,/);
});
test('input language setting supports Japanese, English and named other languages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  const source = page.getByRole('textbox', { name: '入力する .bib' });
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  const language = page.getByRole('combobox', { name: '言語', exact: true });
  await expect(language).toHaveValue('japanese');
  await source.fill('@misc{,author={山田 太郎},title={研究},year=2026}');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(output).toHaveValue(/language = \{japanese\}/);
  await expect(page.getByLabel('山田2026', { exact: true })).toHaveValue('2026_山田_研究');
  await language.selectOption({ label: '英語' });
  await source.fill('@misc{,author={Jane Smith},title={A Study},year=2025}');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(output).toHaveValue(/language = \{english\}/);
  await expect(page.getByLabel('Smith2025', { exact: true })).toHaveValue('2025_Smith_A-Study');
  await language.selectOption({ label: 'その他' });
  await page.getByRole('textbox', { name: '言語名', exact: true }).fill('french');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(output).toHaveValue(/language = \{french\}/);
  await page.getByRole('textbox', { name: '言語名', exact: true }).fill('');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(output).toHaveValue(/language = \{\}/);
  await page.screenshot({ path: 'test-results/language-settings-390.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('PDF import uses the selected input language', async ({ page }) => {
  const { makePdf } = await import('../pdf-fixtures');
  await page.goto('/');
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('english');
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'language.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf({ title: 'A Study', author: 'Jane Smith', year: '2025' })) });
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/language = \{english\}/);
});
test('bibtex query parameter fills the input and converts Unicode and reserved characters once', async ({ page }) => {
  const bib = '@misc{, author={山田, 太郎}, title={日本語 + A&B #? 100%25}, year=2026}';
  await page.goto(`/?${new URLSearchParams({ bibtex: bib })}`);
  await expect(page.getByRole('textbox', { name: '入力する .bib' })).toHaveValue(bib);
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/^@misc\{山田2026,/);
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/日本語 \+ A&B #\? 100%25/);
});
test('invalid bibtex query parameter keeps the input available for editing', async ({ page }) => {
  const bib = '@article{broken';
  await page.goto(`/?${new URLSearchParams({ bibtex: bib })}`);
  await expect(page.getByRole('textbox', { name: '入力する .bib' })).toHaveValue(bib);
  await expect(page.getByRole('status')).toContainText('変換できませんでした');
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue('');
});
test('empty bibtex query parameter leaves the editors empty', async ({ page }) => {
  await page.goto('/?bibtex=');
  await expect(page.getByRole('textbox', { name: '入力する .bib' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue('');
  await expect(page.getByRole('status')).not.toBeVisible();
});

test('field controls are grouped by type and additions disappear after use', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await output.fill('@article{x,title={Title},author={Smith, Jane},date={2024},booktitle={Wrong},publisher={Wrong publisher},_tags={keep}}');
  await expect(page.getByRole('group', { name: '必須', exact: true }).getByRole('button', { name: '掲載誌を追加' })).toBeVisible();
  await expect(page.getByRole('group', { name: '任意', exact: true }).getByRole('button', { name: 'DOIを追加' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'タイトルを追加', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'タグ（ユーザー定義）を追加', exact: true })).toHaveCount(0);
  await page.getByRole('group', { name: '削除', exact: true }).getByRole('button', { name: '会議名・収録書名を削除' }).click();
  await expect(output).not.toHaveValue(/booktitle/);
  await expect(output).toHaveValue(/publisher = \{Wrong publisher\}/);
  await expect(output).toHaveValue(/_tags = \{keep\}/);
  await page.getByRole('button', { name: '掲載誌を追加', exact: true }).click();
  await expect(page.getByRole('button', { name: '掲載誌を追加', exact: true })).toHaveCount(0);
  await expect(output).toBeFocused();
  await output.pressSequentially('Journal');
  await expect(output).toHaveValue(/journaltitle = \{Journal\}/);
  await page.screenshot({ path: 'test-results/field-categories-390.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('changing entry type updates required and deletion candidates without deleting fields automatically', async ({ page }) => {
  await page.goto('/');
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await output.fill('@article{x,title={Title},author={Smith, Jane},date={2024},journaltitle={Keep until deleted}}');
  await page.getByRole('combobox', { name: 'x の文献種別' }).selectOption('thesis');
  await page.getByRole('button', { name: 'x の種別を変更', exact: true }).click();
  await expect(page.getByRole('group', { name: '必須', exact: true }).getByRole('button', { name: '所属機関を追加' })).toBeVisible();
  await expect(page.getByRole('group', { name: '削除', exact: true }).getByRole('button', { name: '掲載誌を削除' })).toBeVisible();
  await expect(output).toHaveValue(/journaltitle = \{Keep until deleted\}/);
  await page.getByRole('button', { name: '掲載誌を削除', exact: true }).click();
  await expect(output).not.toHaveValue(/journaltitle/);
});
