import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    test(`rapid drag followed by ${ending} keeps the ${theme} viewer usable`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await page.getByRole('combobox', { name: 'Appearance' }).selectOption(theme);
      const svg = page.getByRole('group', { name: 'Interactive file dependency map' });
      const box = (await svg.boundingBox())!;
      await page.mouse.move(box.x + 25, box.y + 45);
      await page.mouse.down();
      // A release can arrive while React still has queued updates from prior moves.
      const before = await page.locator('.dependency-svg > g').getAttribute('transform');
      await svg.evaluate(
        (element, { x, y, ending }) => {
          for (let i = 1; i <= 12; i++) {
            element.dispatchEvent(
              new PointerEvent('pointermove', {
                bubbles: true,
                pointerId: 1,
                pointerType: 'mouse',
                buttons: 1,
                clientX: x + i * 4,
                clientY: y + i * 3,
              }),
            );
          }
          element.dispatchEvent(
            new PointerEvent(ending, {
              bubbles: true,
              pointerId: 1,
              pointerType: 'mouse',
              button: 0,
              clientX: x + 48,
              clientY: y + 36,
            }),
          );
        },
        { x: box.x + 25, y: box.y + 45, ending },
      );
      await page.mouse.up();
      await expect(
        page.getByRole('heading', { name: 'See the shape of your code.' }),
      ).toBeVisible();
      await expect(page.locator('.graph-node')).toHaveCount(33);
      const map = page.locator('.dependency-svg > g');
      await expect(map).not.toHaveAttribute('transform', before!);
      await expect(map).not.toHaveAttribute('transform', /NaN|Infinity/);
      const after = await map.getAttribute('transform');
      await page.mouse.move(box.x + 90, box.y + 100);
      await expect(map).toHaveAttribute('transform', after!);
      expect(errors).toEqual([]);
      await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
      await expect(page.locator('.zoom-controls')).toContainText('100%');
    });
  }
}

test('another pointer cannot interrupt an active drag', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const svg = page.getByRole('group', { name: 'Interactive file dependency map' });
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + 45);
  await page.mouse.down();
  const before = await page.locator('.dependency-svg > g').getAttribute('transform');
  await svg.evaluate((element) => {
    element.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerId: 99, pointerType: 'touch' }),
    );
  });
  await page.mouse.move(box.x + 55, box.y + 75, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.dependency-svg > g')).not.toHaveAttribute('transform', before!);
  await expect(page.locator('.graph-node')).toHaveCount(33);
  expect(errors).toEqual([]);
});

test('repeated vertical wheel gestures keep zoom bounded and the viewer responsive', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const svg = page.getByRole('group', { name: 'Interactive file dependency map' });
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -200);
    await page.mouse.wheel(0, 200);
  }
  await expect(page.locator('.graph-node')).toHaveCount(33);
  await expect(page.locator('.dependency-svg > g')).not.toHaveAttribute(
    'transform',
    /NaN|Infinity/,
  );
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await expect(page.locator('.zoom-controls')).toContainText('100%');
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});
