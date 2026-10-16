import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const fixture = {
  version: 1,
  name: 'path-workspace',
  warnings: [],
  nodes: ['start', 'long', 'middle', 'shortcut', 'target', 'island'].map((name, index) => ({
    id: `src/${name}.ts`,
    label: `${name}.ts`,
    folder: 'src',
    lines: index + 1,
    bytes: name === 'island' ? 9000 : (index + 1) * 100,
    external: [],
    unresolved: [],
  })),
  edges: [
    ['start', 'long', 'static'],
    ['start', 'shortcut', 'static'],
    ['start', 'target', 'type'],
    ['long', 'middle', 'static'],
    ['middle', 'target', 'static'],
    ['shortcut', 'target', 'static'],
    ['target', 'long', 'static'],
  ].map(([source, target, kind]) => ({
    source: `src/${source}.ts`,
    target: `src/${target}.ts`,
    kind,
  })),
};
async function load(page: Page, graph: unknown = fixture) {
  await page.goto('/');
  await page.getByLabel('Graph JSON file', { exact: true }).setInputFiles({
    name: 'architecture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(graph)),
  });
  await expect(page.locator('.header-project')).not.toContainText('orbit-workspace');
}

test('trace the shortest route, export it, and recalculate when types are excluded', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await load(page);
  await page.getByRole('button', { name: 'Trace path', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'How do these files connect?' });
  await expect(dialog.getByLabel('From file', { exact: true })).toHaveValue('src/start.ts');
  await dialog.getByLabel('To file', { exact: true }).fill('src/target.ts');
  await dialog.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await expect(dialog.locator('.path-result-heading')).toContainText('1 import · 2 files');
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download path', exact: true }).click();
  const text = await readFile((await (await pending).path())!, 'utf8');
  expect(text).toContain('1. src/start.ts\n2. src/target.ts');
  await dialog.getByRole('button', { name: 'Show on map', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.graph-node')).toHaveCount(2);
  await expect(page.locator('.path-banner')).toContainText('1 import');
  await page.locator('.type-toggle').click();
  await expect(page.locator('.graph-node')).toHaveCount(3);
  await expect(page.locator('.path-banner')).toContainText('2 imports');
  await expect(
    page.getByRole('button', { name: 'Select src/shortcut.ts', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select src/long.ts', exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('.dependency-svg > g > path')).toHaveCount(2);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const reportPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Architecture report', exact: true }).click();
  const report = await readFile((await (await reportPending).path())!, 'utf8');
  expect(report).toContain('## Isolated files');
  expect(report).toContain('- src/island.ts');
  expect(report).toContain('1. src/start.ts\n2. src/shortcut.ts\n3. src/target.ts');
  await page.getByRole('button', { name: 'Clear traced path', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('path finder validates file names, honors direction, swaps endpoints, and handles the same file', async ({
  page,
}) => {
  await load(page);
  await page.getByRole('button', { name: 'Trace path', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('To file', { exact: true }).fill('src/missing.ts');
  await dialog.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('existing file paths');
  await dialog.getByLabel('From file', { exact: true }).fill('src/target.ts');
  await dialog.getByLabel('To file', { exact: true }).fill('src/start.ts');
  await dialog.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('No directed import path');
  await dialog.getByRole('button', { name: 'Swap endpoints', exact: true }).click();
  await dialog.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await expect(dialog.locator('.path-result')).toBeVisible();
  await dialog.getByLabel('To file', { exact: true }).fill('src/start.ts');
  await dialog.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await expect(dialog.locator('.path-result-heading')).toContainText('Same file · 0 imports');
  await dialog.getByRole('button', { name: 'Show on map', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await expect(page.locator('.dependency-svg > g > path')).toHaveCount(0);
});

test('an unavailable path returns when the type filter allows it again', async ({ page }) => {
  const graph = {
    ...fixture,
    nodes: fixture.nodes.slice(0, 2),
    edges: [{ source: 'src/start.ts', target: 'src/long.ts', kind: 'type' }],
  };
  await load(page, graph);
  await page.getByRole('button', { name: 'Trace path', exact: true }).click();
  await page.getByLabel('To file', { exact: true }).fill('src/long.ts');
  await page.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await page.getByRole('button', { name: 'Show on map', exact: true }).click();
  await page.locator('.type-toggle').click();
  await expect(page.locator('.graph-node')).toHaveCount(0);
  await expect(page.locator('.path-banner')).toContainText('No path with current type filter');
  await page.locator('.type-toggle').click();
  await expect(page.locator('.graph-node')).toHaveCount(2);
});

test('islands and explorer sorting use real metadata without rearranging the map', async ({
  page,
}) => {
  await load(page);
  await expect(page.locator('.tree-file').first()).toHaveAttribute('title', 'src/island.ts');
  const positions = await page
    .locator('.graph-node')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')));
  await page.getByRole('combobox', { name: 'Sort files' }).selectOption('connections');
  await expect(page.locator('.tree-file').first()).toHaveAttribute('title', 'src/target.ts');
  await expect(page.locator('.tree-file').first().locator('.file-metric')).toHaveText('4');
  await page.getByRole('combobox', { name: 'Sort files' }).selectOption('size');
  await expect(page.locator('.tree-file').first()).toHaveAttribute('title', 'src/island.ts');
  expect(
    await page
      .locator('.graph-node')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform'))),
  ).toEqual(positions);
  await page.locator('.view-tabs').getByRole('button', { name: 'Islands' }).click();
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Select src/island.ts', exact: true }),
  ).toHaveAttribute('opacity', '1');
  await expect(page.locator('.graph-notice')).toContainText('may still be entry points');
  await page.locator('.view-tabs').getByRole('button', { name: 'All files' }).click();
  await expect(page.locator('.graph-node')).toHaveCount(6);
});

test('long routes keep all steps available while the map respects its render limit', async ({
  page,
}) => {
  const id = (index: number) => `src/n${String(index).padStart(4, '0')}.ts`;
  await load(page, {
    version: 1,
    name: 'long-route',
    warnings: [],
    nodes: Array.from({ length: 360 }, (_, index) => ({
      id: id(index),
      label: id(index).slice(4),
      folder: 'src',
      lines: 1,
      bytes: 10,
      external: [],
      unresolved: [],
    })),
    edges: Array.from({ length: 359 }, (_, index) => ({
      source: id(index),
      target: id(index + 1),
      kind: 'static',
    })),
  });
  await page.getByRole('button', { name: 'Trace path', exact: true }).click();
  await page.getByLabel('To file', { exact: true }).fill(id(359));
  await page.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await expect(page.locator('.path-result-heading')).toContainText('359 imports · 360 files');
  await expect(page.getByText('Showing the first 100 steps.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Show on map', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(350);
  await expect(page.locator('.graph-notice')).toContainText('first 350 route files');
  await page.getByRole('textbox', { name: 'Find a file' }).fill('n0359');
  await expect(page.getByRole('button', { name: `Select ${id(359)}`, exact: true })).toBeVisible();
});

test('path dialog and four map views remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await load(page);
  await page.getByRole('button', { name: 'Trace path', exact: true }).click();
  await page.getByRole('dialog').click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('To file', { exact: true }).fill('src/target.ts');
  await page.getByRole('button', { name: 'Trace import path', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show on map', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
