import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('appearance follows the system, persists an override, and preserves the current exploration', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const appearance = page.getByRole('combobox', { name: 'Appearance' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(appearance).toHaveValue('system');
  await page.getByRole('button', { name: 'Select src/api/client.ts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find a file' }).fill('client');
  const positions = await page
    .locator('.graph-node')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('transform')));
  await appearance.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.inspected-file h2')).toHaveText('client.ts');
  await expect(page.getByRole('textbox', { name: 'Find a file' })).toHaveValue('client');
  expect(
    await page
      .locator('.graph-node')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('transform'))),
  ).toEqual(positions);
  await page.reload();
  await expect(appearance).toHaveValue('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await appearance.selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await appearance.selectOption('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('theme bootstraps before React loads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('repo-atlas:theme', 'light'));
  await page.route('**/src/main.tsx', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.locator('html').evaluate((e) => e.style.colorScheme)).toBe('light');
  await expect(page.locator('#root')).toBeEmpty();
});

test('appearance still works when browser storage is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    }),
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.graph-node')).toHaveCount(32);
  expect(errors).toEqual([]);
});

test('focus, transitive impact, copy path and type filters work together', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const graph = {
    version: 1,
    name: 'impact-fixture',
    warnings: [],
    nodes: ['c.ts', 'b.ts', 'a.ts', 'island.ts'].map((id) => ({
      id,
      label: id,
      folder: '.',
      lines: 1,
      bytes: 10,
      external: [],
      unresolved: [],
    })),
    edges: [
      { source: 'a.ts', target: 'b.ts', kind: 'static' },
      { source: 'b.ts', target: 'c.ts', kind: 'type' },
      { source: 'c.ts', target: 'b.ts', kind: 'static' },
    ],
  };
  await page.getByLabel('Graph JSON file', { exact: true }).setInputFiles({
    name: 'impact.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(graph)),
  });
  await expect(page.locator('.impact-card strong')).toHaveText('2');
  await page.getByRole('button', { name: 'Copy file path', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('c.ts');
  await page.getByRole('textbox', { name: 'Find a file' }).fill('island');
  await page.getByRole('button', { name: 'Focus connections', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Find a file' })).toHaveValue('');
  await page.getByRole('button', { name: 'Explore impact', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(3);
  await expect(page.locator('.focus-banner')).toContainText('Change impact');
  await page.locator('.type-toggle').click();
  await expect(page.getByRole('checkbox', { name: 'Type imports' })).not.toBeChecked();
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await expect(page.locator('.impact-card strong')).toHaveText('0');
  await page.getByRole('button', { name: 'Clear focus', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(4);
});

test('SVG exports freeze the current light and dark palette', async ({ page }) => {
  await page.goto('/');
  for (const [theme, background, accent] of [
    ['light', 'rgb(248, 250, 246)', '#3b741e'],
    ['dark', 'rgb(18, 23, 20)', '#c3f36b'],
  ]) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Map as SVG', exact: true }).click();
    const svg = await readFile((await (await pending).path())!, 'utf8');
    const result = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      return {
        error: !!doc.querySelector('parsererror'),
        background: doc.querySelector('svg > rect')?.getAttribute('fill'),
        accent: doc.querySelector('#arrow-active path')?.getAttribute('fill'),
        halo: doc.querySelector('.graph-node text')?.getAttribute('style'),
      };
    }, svg);
    expect(result.error).toBe(false);
    expect(result.background).toBe(background);
    expect(result.accent).toBe(accent);
    expect(result.halo).toContain('paint-order: stroke');
  }
});

test('light desktop and mobile layouts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('light');
  await expect(page.locator('.graph-node')).toHaveCount(32);
  await page.screenshot({ path: 'test-results/light-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('Escape');
  for (const width of [360, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/light-mobile.png', fullPage: true });
});
