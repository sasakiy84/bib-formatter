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
test('invalid input clears stale output and disables copying', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '入力する .bib' }).fill('@misc{x,title={Valid},year=2024}');
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByRole('button', { name: '結果をコピー' })).toBeEnabled();
  await page.getByRole('textbox', { name: '入力する .bib' }).fill('@article{broken');
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue('');
  await expect(page.getByRole('button', { name: '結果をコピー' })).toBeDisabled();
  await page.getByRole('button', { name: 'biblatex に変換' }).click();
  await expect(page.getByRole('status')).toContainText('変換できませんでした');
});
test('uploaded Japanese bibliography and keyboard conversion work', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('.bib ファイルを開く').setInputFiles({ name: 'japanese.bib', mimeType: 'text/plain', buffer: Buffer.from('@book{jp,author={夏目, 漱石},title={こころ},year=1914,publisher={岩波書店}}') });
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
