import { expect, test, type Page } from '@playwright/test';

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 32);
}

async function isolateClient(page: Page): Promise<void> {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}`,
  });
}

async function registerByApi(page: Page): Promise<{ username: string; password: string }> {
  const username = uniqueUsername('e2e');
  const password = 'Playwright-pass-2026';
  const response = await page.context().request.post('/api/auth/register', {
    data: { username, password },
  });
  expect(response.status()).toBe(200);
  return { username, password };
}

async function expectVisibleTouchTargets(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const elements = page.locator(selector);
    let checked = 0;
    for (const element of await elements.all()) {
      if (!(await element.isVisible())) continue;
      const box = await element.boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box?.width ?? 0, `${selector} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `${selector} height`).toBeGreaterThanOrEqual(44);
      checked += 1;
    }
    expect(checked, `${selector} visible matches`).toBeGreaterThan(0);
  }
}

test('registers through the UI, edits, saves, and reloads a document', async ({ page }) => {
  const username = uniqueUsername('ui');
  const password = 'Playwright-pass-2026';

  await isolateClient(page);
  await page.goto('/login');
  await expect(page.getByText('未绑定可信身份且忘记密码的账号无法自动恢复。')).toBeVisible();
  await page.getByRole('button', { name: '创建账号' }).click();
  await page.getByLabel('账号名').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码').fill(password);
  await page.getByRole('button', { name: '创建并进入' }).click();

  await expect(page).toHaveURL(/\/docs(?:\?|$)/);
  await page.getByLabel('新建文档').click();
  await expect(page).toHaveURL(/\/docs\/[A-Za-z0-9_-]{24}/);

  await page.getByPlaceholder('无标题文档').fill('M5 自动化验收');
  await page.getByRole('textbox', { name: '文档正文' }).fill('自动保存与刷新恢复正常。');
  await expect(page.getByText('已保存')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'M5 自动化验收' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    '自动保存与刷新恢复正常。',
  );
  await expect(
    page.locator('.swan-sidebar-root-documents').getByText('M5 自动化验收'),
  ).toBeVisible();
  await expect(page.getByText('未归档')).toHaveCount(0);
});

test('creating a folder preserves the current workspace tree', async ({ page }) => {
  await isolateClient(page);
  await registerByApi(page);

  const createdDirectory = await page.context().request.post('/api/documents', {
    data: { title: '根目录文档', folderId: null },
  });
  expect(createdDirectory.status()).toBe(201);
  const folderResponse = await page.context().request.post('/api/folders', {
    data: { name: '已有文件夹', parentId: null },
  });
  expect(folderResponse.status()).toBe(201);
  const folderId = ((await folderResponse.json()) as { id: string }).id;
  const folderDocumentResponse = await page.context().request.post('/api/documents', {
    data: { title: '文件夹文档', folderId },
  });
  expect(folderDocumentResponse.status()).toBe(201);

  await page.goto('/docs');
  await expect(page.locator('.swan-sidebar-root-documents').getByText('根目录文档')).toBeVisible();
  await expect(page.locator('.swan-folder-row').filter({ hasText: '已有文件夹' })).toBeVisible();
  await page.locator('.swan-folder-row').filter({ hasText: '已有文件夹' }).click();
  await expect(
    page.locator('.swan-sidebar-doc-item').filter({ hasText: '文件夹文档' }),
  ).toBeVisible();

  await expect(page.locator('.swan-sidebar-root-documents').getByText('根目录文档')).toBeVisible();
  await expect(page.locator('.swan-folder-row').filter({ hasText: '已有文件夹' })).toBeVisible();
  await expect(
    page.locator('.swan-sidebar-doc-item').filter({ hasText: '文件夹文档' }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]folder=/);

  await page.getByRole('button', { name: '新建文件夹' }).click();
  await page.getByLabel('新文件夹名称').fill('项目资料');
  await page.getByRole('button', { name: '创建文件夹' }).click();

  await expect(page.getByText('文件夹已创建')).toBeVisible();
  await expect(page.locator('.swan-folder-row').filter({ hasText: '项目资料' })).toBeVisible();
  await expect(page.locator('.swan-sidebar-root-documents').getByText('根目录文档')).toBeVisible();
  await expect(
    page.locator('.swan-sidebar-doc-item').filter({ hasText: '文件夹文档' }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]folder=/);
});

test('paginates documents, enforces create limits, and isolates ownership', async ({ browser }) => {
  const healthContext = await browser.newContext();
  const healthResponse = await healthContext.request.get('/api/health/db');
  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toEqual({ ok: true });
  expect(healthResponse.headers()['server-timing']).toContain('db;');
  await healthContext.close();

  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  await isolateClient(firstPage);
  await registerByApi(firstPage);
  const createdIds: string[] = [];

  for (let index = 0; index < 60; index += 1) {
    const response = await firstContext.request.post('/api/documents', {
      data: { title: `分页文档 ${index + 1}`, folderId: null },
    });
    expect(response.status()).toBe(201);
    createdIds.push(((await response.json()) as { id: string }).id);
  }

  const rateLimited = await firstContext.request.post('/api/documents', {
    data: { title: '超过创建频率', folderId: null },
  });
  expect(rateLimited.status()).toBe(429);

  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const response = await firstContext.request.get(`/api/documents?limit=10${suffix}`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    seen.push(...body.items.map((item) => item.id));
    cursor = body.nextCursor;
  } while (cursor);

  expect(new Set(seen).size).toBe(createdIds.length);
  expect(seen.sort()).toEqual([...createdIds].sort());

  await firstPage.goto('/docs');
  await expect(firstPage.locator('.swan-sidebar-doc-item')).toHaveCount(50);
  await firstPage.getByRole('button', { name: '载入更多文档' }).click();
  await expect(firstPage.locator('.swan-sidebar-doc-item')).toHaveCount(60);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await isolateClient(secondPage);
  await registerByApi(secondPage);
  const isolated = await secondContext.request.get(`/api/documents/${createdIds[0]}`);
  expect(isolated.status()).toBe(404);

  await firstContext.close();
  await secondContext.close();
});

test('mobile workspace keeps the topbar readable and primary targets at least 44px', async ({
  page,
}) => {
  await isolateClient(page);
  await registerByApi(page);
  await page.goto('/docs');
  await page.getByLabel('新建文档').click();
  await page.getByPlaceholder('无标题文档').fill('移动端走查');
  await page.getByRole('textbox', { name: '文档正文' }).fill('移动端正文');
  await expect(page.getByText('已保存')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /打开位置菜单/ })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

  for (const name of [/打开菜单/, /打开位置菜单/, /文档操作/, /完成|编辑/]) {
    const locator = page.getByRole('button', { name });
    const box = await locator.boundingBox();
    expect(box, String(name)).not.toBeNull();
    expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
  }

  await expect(page.locator('.swan-format-more')).toBeVisible();
  await expect(page.locator('.swan-format-secondary').first()).toBeHidden();

  await page.getByRole('button', { name: '打开菜单' }).click();
  for (const name of ['导入文档', '新建文档', '批量选择']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
  }
});

test('mobile public entry controls keep 44px touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '让文字 飞起来。' })).toBeVisible();
  await expectVisibleTouchTargets(page, [
    '.swan-public-brand',
    '.swan-public-nav a',
    '.swan-home-actions .swan-public-button',
    '.swan-public-footer a',
  ]);

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '回到你的文字' })).toBeVisible();
  await expectVisibleTouchTargets(page, [
    '.swan-public-brand',
    '.swan-login-back',
    '.swan-login-form .ant-input-suffix',
    '.swan-login-switch button',
  ]);
});

test('permanently deletes a trashed document and its attachment metadata', async ({ page }) => {
  await isolateClient(page);
  await registerByApi(page);
  const created = await page.context().request.post('/api/documents', {
    data: { title: '永久删除验收', folderId: null },
  });
  expect(created.status()).toBe(201);
  const documentId = ((await created.json()) as { id: string }).id;

  const uploaded = await page.context().request.post(`/api/documents/${documentId}/attachments`, {
    multipart: {
      file: {
        name: 'm5.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('M5 attachment cleanup'),
      },
    },
  });
  expect(uploaded.status()).toBe(201);

  const deleted = await page.context().request.delete(`/api/documents/${documentId}`);
  expect(deleted.status()).toBe(200);

  await page.goto('/docs?view=trash');
  const row = page.locator('.swan-sidebar-doc.is-trash').filter({ hasText: '永久删除验收' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '永久删除 永久删除验收' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '永久删除', exact: true }).click();
  await expect(row).toHaveCount(0);

  const trash = await page.context().request.get('/api/documents/trash');
  expect(trash.status()).toBe(200);
  expect(
    ((await trash.json()) as { items: Array<{ id: string }> }).items.some(
      (item) => item.id === documentId,
    ),
  ).toBe(false);
  expect(
    (await page.context().request.get(`/api/documents/${documentId}/attachments`)).status(),
  ).toBe(404);
});
