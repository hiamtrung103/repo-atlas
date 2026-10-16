import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('demo exploration, search, filters, cycles and export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'See the shape of your code.' })).toBeVisible();
  await expect(page.locator('.graph-node')).toHaveCount(32);
  await page.getByRole('button', { name: 'Select src/api/client.ts', exact: true }).click();
  await expect(page.locator('.inspected-file h2')).toHaveText('client.ts');
  await page.getByRole('textbox', { name: 'Find a file' }).fill('useTheme');
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.locator('.view-tabs').getByRole('button', { name: 'Cycles' }).click();
  await expect(page.locator('.graph-node')).toHaveCount(5);
  await page.locator('.view-tabs').getByRole('button', { name: 'All files' }).click();
  await page.getByRole('button', { name: 'Hide all', exact: true }).click();
  await expect(page.getByText('No files in this view')).toBeVisible();
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(32);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.zoom-controls')).toContainText('120%');
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await expect(page.locator('.zoom-controls')).toContainText('100%');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Graph JSON', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('repo-atlas-graph.json');
  expect(errors).toEqual([]);
});

test('scans a real project folder in the worker, resolves aliases and finds its cycle', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page
    .getByLabel('Project folder', { exact: true })
    .setInputFiles(resolve('examples/tiny-project'));
  await expect(page.locator('.header-project')).toContainText('tiny-project', { timeout: 30000 });
  await expect(page.locator('.graph-node')).toHaveCount(6);
  await page.getByRole('button', { name: 'Select src/main.ts', exact: true }).click();
  await expect(page.locator('.connection-stats')).toContainText('3');
  await page.locator('.view-tabs').getByRole('button', { name: 'Cycles' }).click();
  await expect(page.locator('.graph-node')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('imports validated JSON and displays invalid input errors', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Graph JSON file', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":9}'),
  });
  await expect(page.getByRole('alert')).toContainText('Unsupported graph format');
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  const graph = {
    version: 1,
    name: 'test-import',
    warnings: [],
    nodes: [
      { id: 'a.ts', label: 'a.ts', folder: '.', lines: 2, bytes: 12, external: [], unresolved: [] },
    ],
    edges: [],
  };
  await page.getByLabel('Graph JSON file', { exact: true }).setInputFiles({
    name: 'graph.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(graph)),
  });
  await expect(page.locator('.header-project')).toContainText('test-import');
  await expect(page.locator('.graph-node')).toHaveCount(1);
});

test('dialog is keyboard accessible and mobile layout stays within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('capture the explorer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.graph-node')).toHaveCount(32);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});
