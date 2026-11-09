import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`sample converts, downloads and stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await page.getByRole('button', { name: 'biblatex に変換' }).click();
    await expect(page.getByRole('status')).toContainText('3件を変換');
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
  await expect(page.getByRole('status')).toHaveText('コピーしました。');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2024_Smith-Jones-Lee-et-al_A-Sample-Study-of-AI-Tools');
});
test('built HTML works offline as a local file without subresource requests', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await context.setOffline(true);
  await page.goto(new URL('../../dist/index.html', import.meta.url).href);
  await page.getByRole('button', { name: 'サンプルを入力' }).click();
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByRole('status')).toContainText('3件を変換');
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
    await expect(page.getByRole('status')).toContainText('1件を変換');
    await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue(/journaltitle = \{Journal of Examples\}/);
    await expect(page.getByLabel('pdf-import', { exact: true })).toHaveValue('2024_Smith-Jones-Lee-et-al_An-English-PDF-Study');
    await page.getByRole('button', { name: 'pdf-import のファイル名をコピー', exact: true }).click();
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
  await expect(page.getByLabel('pdf-import', { exact: true })).toHaveValue('nd_佐藤_日本語の研究');
  await expect(page.getByLabel('確認する項目')).toContainText('PDF に出版日がありません');
  const source = page.getByRole('textbox', { name: '入力する .bib' });
  await source.fill((await source.inputValue()).replace('@misc{pdf-import,', '@misc{pdf-import,\n  date = {2025},'));
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByLabel('pdf-import', { exact: true })).toHaveValue('2025_佐藤_日本語の研究');
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
  await expect(page.getByLabel('pdf-import', { exact: true })).toHaveValue('2024_Smith_Offline-Study');
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
test('extracts missing information from first-page text offline with an embedded PDF worker', async ({ page, context }) => {
  const { makePdf } = await import('../pdf-fixtures');
  await context.setOffline(true);
  await page.goto(new URL('../../dist/index.html', import.meta.url).href);
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf({ text: [
    { text: 'Example Conference (2025)', x: 80, y: 810, size: 10 },
    { text: 'A Synthetic Paper Title', x: 80, y: 740, size: 18 },
    { text: 'Jane Smith', x: 80, y: 715, size: 12 },
    { text: 'Alex Jones', x: 220, y: 715, size: 12 },
  ] })) });
  await expect(page.getByLabel('pdf-import', { exact: true })).toHaveValue('2025_Smith-Jones_A-Synthetic-Paper-Title');
  await expect(page.getByRole('combobox', { name: 'pdf-import の文献種別' })).toHaveValue('inproceedings');
  await expect(page.getByLabel('確認する項目')).toContainText('1ページ目の見出しから');
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
  await expect(page.getByRole('button', { name: 'タイトルを追加', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '出版年月日を追加', exact: true }).click();
  await expect(output).toBeFocused();
  await output.pressSequentially('2027');
  await expect(page.getByLabel('x', { exact: true })).toHaveValue('2027_Smith_Editable');
  await expect(page.getByRole('button', { name: '出版年月日を追加', exact: true })).toBeDisabled();
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
