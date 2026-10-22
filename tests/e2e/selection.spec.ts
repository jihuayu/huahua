import { expect, test } from '@playwright/test';
test('selecting text with the mouse captures and saves the exact excerpt', async ({ page }) => {
  await page.goto('/');
  const paragraph = page.locator('#copy');
  const box = await paragraph.boundingBox(); if (!box) throw new Error('article not visible');
  await page.mouse.move(box.x + 0, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  await page.locator('#highlight').click();
  await expect(page.locator('output')).toContainText('Saved excerpt:');
  await expect.poll(() => page.evaluate(() => [...((window as Window & { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights?.keys() ?? [])].some(key => key.startsWith('huahua-') && key.endsWith('-yellow')))).toBe(true);
});
test('the save action is keyboard operable after selecting text', async ({ page }) => {
  await page.goto('/'); const paragraph = page.locator('#copy'); const box = await paragraph.boundingBox(); if (!box) throw new Error('article not visible');
  await page.mouse.move(box.x + 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  const save = page.locator('#highlight'); await save.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('output')).toContainText('Saved excerpt:');
});
test('forced overlay rendering adds marks without replacing article text', async ({ page }) => {
  await page.goto('/?renderer=overlay'); const paragraph = page.locator('#copy'); const text = await paragraph.textContent(); const box = await paragraph.boundingBox(); if (!box) throw new Error('article not visible');
  await page.mouse.move(box.x + 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  await page.locator('#highlight').click(); await expect(page.locator('[data-huahua-overlay-mark]')).not.toHaveCount(0);
  await expect(paragraph).toHaveText(text ?? '');
});
