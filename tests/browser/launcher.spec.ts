import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseVerbatim } from '@retorquere/bibtex-parser/js';
import { draftKey } from '../../src/draft';

const original = '@article{manualKey, author={Smith, Jane}, title={Direct Edit}, date={2024}, language={french}, _notes={Keep {my memo}}, _tags={日本語}, _download_at={2020-01-01}, custom={Keep too}}';

test('missing or empty tags do not show candidates', async ({ page }) => {
  for (const url of ['/', '/?tags=&tags=%20%20']) {
    await page.goto(url);
    await expect(page.getByRole('group', { name: 'タグ候補', exact: true })).not.toBeVisible();
  }
});

for (const width of [1280, 390]) {
  test(`tag candidates preserve values and support keyboard, duplicates and disabled states at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const tags = [' 日本語 ', '読解', 'text difficulty', 'A&B', 'x+y', '', '日本語', 'Text difficulty', '%2C', 'a,b', 'two  spaces', '長いタグ' + 'VeryLongUnbrokenTag'.repeat(8)];
    const query = new URLSearchParams({ prefix: 'MA0011_' });
    for (const tag of tags) query.append('tags', tag);
    await page.goto(`/?${query}`);
    const group = page.getByRole('group', { name: 'タグ候補', exact: true });
    await expect(group.getByRole('button')).toHaveText(tags.map(tag => tag.trim()).filter((tag, index, all) => tag && all.indexOf(tag) === index));
    for (const button of await group.getByRole('button').all()) await expect(button).toBeDisabled();
    const source = page.getByRole('textbox', { name: '入力する .bib' });
    const output = page.getByRole('textbox', { name: '変換した biblatex' });
    await source.fill('@misc{left,title={Keep Left}}');
    await output.fill(original);
    await expect(output).toHaveValue(original);
    const selected = group.getByRole('button', { name: '日本語（追加済み）', exact: true });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await selected.dblclick({ force: true });
    await expect(output).toHaveValue(original);
    const reading = group.getByRole('button', { name: '読解', exact: true });
    await reading.focus();
    await reading.press('Enter');
    const added = group.getByRole('button', { name: '読解（追加済み）', exact: true });
    await expect(added).toBeFocused();
    await expect(added).toHaveCSS('outline-offset', '2px');
    const once = await output.inputValue();
    await added.press('Space');
    await expect(output).toHaveValue(once);
    await added.press('Tab');
    await expect(group.getByRole('button', { name: 'text difficulty', exact: true })).toBeFocused();
    await group.getByRole('button', { name: 'text difficulty', exact: true }).press('Space');
    for (const tag of ['Text difficulty', 'A&B', 'x+y', '%2C', 'two  spaces']) await group.getByRole('button', { name: tag, exact: true }).click();
    const parsed = parseVerbatim(await output.inputValue());
    expect(parsed.entries[0]!.fields._tags).toBe('日本語, 読解, text difficulty, Text difficulty, A&B, x+y, %2C, two  spaces');
    expect(parsed.entries[0]?.key).toBe('manualKey');
    expect(parsed.entries[0]?.fields._notes).toBe('Keep {my memo}');
    expect(parsed.entries[0]?.fields._download_at).toBe('2020-01-01');
    expect(parsed.entries[0]?.fields.custom).toBe('Keep too');
    await expect(source).toHaveValue('@misc{left,title={Keep Left}}');
    await expect(group.getByRole('button', { name: 'a,b', exact: true })).toBeDisabled();
    await expect(group).toContainText('カンマを含むタグは');
    await expect(page.getByLabel('manualKey', { exact: true })).toHaveValue('MA0011_2024_Smith_Direct-Edit');
    await page.screenshot({ path: `test-results/tag-candidates-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    for (const text of ['', '@misc{x,title={A}} @misc{y,title={B}}', '@misc{draft,title={Unfinished']) {
      await output.fill(text);
      for (const button of await group.getByRole('button').all()) await expect(button).toBeDisabled();
      await group.getByRole('button', { name: '読解', exact: true }).evaluate(button => (button as HTMLButtonElement).click());
      await expect(output).toHaveValue(text);
      await expect(source).toHaveValue('@misc{left,title={Keep Left}}');
    }
  });

  test(`iframe prefix reload restores exact edits with new tags and filename at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const first = new URL('https://formatter.test/');
    first.searchParams.set('prefix', 'MA0010_'); first.searchParams.append('tags', '日本語'); first.searchParams.append('tags', 'Old Candidate');
    // Two HTTPS origins model the launcher without triggering Chromium's loopback-network restriction.
    const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
    await page.route('https://formatter.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('https://launcher.test/', route => route.fulfill({ contentType: 'text/html', body: `<body style="margin:0"><iframe title="Bib Formatter" style="width:100%;height:1500px;border:0" src="${first.href.replace(/&/g, '&amp;')}"></iframe></body>` }));
    await page.goto('https://launcher.test/');
    const frame = page.frameLocator('iframe');
    const source = frame.getByRole('textbox', { name: '入力する .bib' });
    const output = frame.getByRole('textbox', { name: '変換した biblatex' });
    await source.fill('@misc{left,title={Original Input}}');
    const language = frame.getByRole('group', { name: '言語', exact: true });
    await language.getByRole('button', { name: 'その他', exact: true }).click();
    await frame.getByRole('textbox', { name: '言語名', exact: true }).fill('french');
    await output.fill(original);
    const editedSource = '@misc{left,title={Unconverted Left Edit}}';
    await source.fill(editedSource);
    await expect(frame.getByLabel('manualKey', { exact: true })).toHaveValue('MA0010_2024_Smith_Direct-Edit');
    const saved = await output.evaluate(() => JSON.parse(sessionStorage.getItem('bib-formatter:draft')!));
    expect(saved.version).toBe(1);
    expect(Object.keys(saved)).not.toContain('prefix'); expect(Object.keys(saved)).not.toContain('tags');
    const next = new URL(first); next.searchParams.set('prefix', 'MA0011_'); next.searchParams.delete('tags');
    next.searchParams.append('tags', '日本語'); next.searchParams.append('tags', 'New & +');
    await page.locator('iframe').evaluate((element, url) => { (element as HTMLIFrameElement).src = url; }, next.href);
    await expect(frame.getByLabel('manualKey', { exact: true })).toHaveValue('MA0011_2024_Smith_Direct-Edit');
    await expect(source).toHaveValue(editedSource);
    await expect(output).toHaveValue(original);
    await expect(language.getByRole('button', { name: 'その他', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.getByRole('textbox', { name: '言語名', exact: true })).toHaveValue('french');
    const group = frame.getByRole('group', { name: 'タグ候補', exact: true });
    await expect(group.getByRole('button', { name: 'Old Candidate', exact: true })).toHaveCount(0);
    await expect(group.getByRole('button', { name: 'New & +', exact: true })).toBeEnabled();
    await expect(group.getByRole('button', { name: '日本語（追加済み）', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const pending = page.waitForEvent('download');
    await frame.getByRole('button', { name: '.bib を保存' }).click();
    const downloaded = await pending;
    expect(downloaded.suggestedFilename()).toBe('MA0011_2024_Smith_Direct-Edit.bib');
    const path = await downloaded.path(); if (!path) throw new Error('Downloaded file unavailable');
    expect(await readFile(path, 'utf8')).toBe(original);
    await group.getByRole('button', { name: 'New & +', exact: true }).click();
    const fields = parseVerbatim(await output.inputValue()).entries[0]!.fields;
    expect(fields._tags).toBe('日本語, New & +'); expect(fields._notes).toBe('Keep {my memo}');
    expect(fields._download_at).toBe('2020-01-01'); expect(fields.language).toBe('french');
    await expect(source).toHaveValue(editedSource);
  });
}

test('syntax errors survive reload and recover without re-converting the left input', async ({ page }) => {
  await page.goto('/?prefix=MA0010_&tags=Tag');
  const source = page.getByRole('textbox', { name: '入力する .bib' });
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await source.fill('@misc{left,title={Left}}');
  const broken = '@article{manualKey,title={Edited},_notes={unfinished';
  await output.fill(broken);
  await page.goto('/?prefix=MA0011_&tags=New');
  await expect(output).toHaveValue(broken);
  await expect(source).toHaveValue('@misc{left,title={Left}}');
  await expect(page.getByRole('status')).toContainText('編集中');
  await expect(page.getByRole('button', { name: '結果をコピー', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '.bib を保存' })).toBeDisabled();
  await expect(page.getByRole('group', { name: 'タグ候補', exact: true }).getByRole('button', { name: 'New', exact: true })).toBeDisabled();
  await output.press('End'); await output.pressSequentially('}}');
  await expect(page.getByRole('button', { name: '.bib を保存' })).toBeEnabled();
  await expect(page.getByLabel('manualKey', { exact: true })).toHaveValue('MA0011_nd_Unknown_Edited');
});

test('URL input priority preserves edits for the same seed and replaces them for a new seed', async ({ page }) => {
  const seedA = '@misc{a,title={Seed A},year=2024}', seedB = '@misc{b,title={Seed B},year=2025}';
  await page.goto(`/?${new URLSearchParams({ bibtex: seedA, prefix: 'MA0010_' })}`);
  const source = page.getByRole('textbox', { name: '入力する .bib' });
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await output.fill(original);
  await source.fill('@misc{pending,title={Pending Left}}');
  await page.goto(`/?${new URLSearchParams({ bibtex: seedA, prefix: 'MA0011_', tags: 'New' })}`);
  await expect(output).toHaveValue(original);
  await expect(source).toHaveValue('@misc{pending,title={Pending Left}}');
  await page.goto(`/?${new URLSearchParams({ bibtex: seedB, prefix: 'MA0012_' })}`);
  await expect(source).toHaveValue(seedB); await expect(output).toHaveValue(/title = \{Seed B\}/);
  const convertedB = await output.inputValue();
  await page.goto('/?prefix=MA0013_');
  await expect(source).toHaveValue(seedB); await expect(output).toHaveValue(convertedB);
});

test('a PDF draft stores and restores only the imported Bib text', async ({ page }) => {
  const { makePdf } = await import('../pdf-fixtures');
  await page.goto('/?prefix=MA0010_');
  await page.getByLabel('.bib または PDF ファイルを開く').setInputFiles({ name: 'study.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf({ title: 'A Study', author: 'Smith, Jane', year: '2026' })) });
  const source = page.getByRole('textbox', { name: '入力する .bib' });
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await expect(output).toHaveValue(/title = \{A Study\}/);
  const before = { source: await source.inputValue(), output: await output.inputValue() };
  const saved = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), draftKey);
  expect(Object.keys(saved).sort()).toEqual(['detectLanguageOnConvert', 'initialBibtex', 'language', 'lastConvertedSource', 'otherLanguage', 'output', 'source', 'version']);
  await page.goto('/?prefix=MA0011_&tags=New');
  await expect(source).toHaveValue(before.source); await expect(output).toHaveValue(before.output);
  await expect(page.getByLabel('Smith2026', { exact: true })).toHaveValue('MA0011_2026_Smith_A-Study');
});

test('an unconverted left-side draft stays unconverted on reload', async ({ page }) => {
  await page.goto('/?prefix=MA0010_');
  const input = '@misc{still, title={Still typing';
  await page.getByRole('textbox', { name: '入力する .bib' }).fill(input);
  await page.goto('/?prefix=MA0011_');
  await expect(page.getByRole('textbox', { name: '入力する .bib' })).toHaveValue(input);
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue('');
});

test('discard clears the screen, storage and old URL seed without restoring them on reload', async ({ page }) => {
  const seed = '@misc{x,title={Seed},year=2024}';
  await page.goto(`/?${new URLSearchParams({ prefix: 'MA0011_', tags: 'Tag', bibtex: seed })}`);
  await page.getByRole('textbox', { name: '変換した biblatex' }).fill(original);
  await page.getByRole('button', { name: '下書きを消去', exact: true }).click();
  expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).toBeNull();
  expect(new URL(page.url()).searchParams.has('bibtex')).toBe(false);
  expect(new URL(page.url()).searchParams.get('prefix')).toBe('MA0011_');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '入力する .bib' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '変換した biblatex' })).toHaveValue('');
  await expect(page.getByRole('button', { name: '.bib を保存' })).toBeDisabled();
});

for (const fault of ['unavailable', 'quota', 'corrupt', 'wrong-version', 'wrong-shape'] as const) {
  test(`conversion remains usable with ${fault} session storage`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ fault, key }) => {
      if (fault === 'unavailable') Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      else if (fault === 'quota') Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
      else sessionStorage.setItem(key, fault === 'corrupt' ? '{broken' : JSON.stringify({ version: fault === 'wrong-shape' ? 1 : 999, source: 42, output: 'Wrong' }));
    }, { fault, key: draftKey });
    await page.goto(`/?${new URLSearchParams({ bibtex: '@misc{x,title={Works},year=2026}', tags: 'Tag' })}`);
    const output = page.getByRole('textbox', { name: '変換した biblatex' });
    await expect(output).toHaveValue(/title = \{Works\}/);
    await page.getByRole('group', { name: 'タグ候補', exact: true }).getByRole('button', { name: 'Tag', exact: true }).click();
    await expect(output).toHaveValue(/_tags = \{Tag\}/);
    await expect(page.getByRole('button', { name: '.bib を保存' })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

test('HTML and script terminators remain literal tags before and after reload', async ({ page }) => {
  const tag = '</script><script>window.tagExecuted=1</script><img src=x onerror="window.tagExecuted=2"> {brace} \\path';
  await page.addInitScript(() => { Object.assign(window, { tagExecuted: 0 }); });
  const requests: string[] = []; page.on('request', request => requests.push(request.url()));
  await page.goto(`/?${new URLSearchParams({ tags: tag })}`);
  const output = page.getByRole('textbox', { name: '変換した biblatex' });
  await output.fill(original);
  await page.getByRole('group', { name: 'タグ候補', exact: true }).getByRole('button', { name: tag, exact: true }).click();
  await page.reload();
  const parsed = parseVerbatim(await output.inputValue());
  expect(parsed.errors).toEqual([]); expect(parsed.entries).toHaveLength(1);
  expect(parsed.entries[0]!.fields._tags).toContain('\\{brace\\} \\textbackslash{}path');
  await expect(page.getByRole('group', { name: 'タグ候補', exact: true }).getByRole('button', { name: `${tag}（追加済み）`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => Reflect.get(window, 'tagExecuted'))).toBe(0);
  await expect(page.locator('img')).toHaveCount(0);
  expect(requests.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
});
