import { test, expect } from '@playwright/test';

test('Arcade bodies preserve scaled sprite offsets and frozen enemies cannot hurt the crystal', async ({
  page,
}) => {
  // Vite module exports let this fixture set up contact deterministically without shipping a window debug API.
  await page.goto('http://127.0.0.1:5175');
  await page.getByRole('button', { name: 'Enter the arena' }).click();
  await page.evaluate(async () => {
    const entry = '/src/main.ts';
    const { rules } = (await import(entry)) as typeof import('../../src/main');
    const enemy = rules.spawn('skeleton');
    enemy.x = 225;
    enemy.y = 410;
    enemy.hp = 10000;
    rules.state.spawnRemaining = 0;
  });
  await expect
    .poll(async () => Number((await page.locator('#hp-text').innerText()).split(' / ')[0]), {
      timeout: 15000,
    })
    .toBeLessThan(100);
  await page.getByRole('button', { name: 'Frost Ward, ready', exact: true }).click();
  const hp = await page.locator('#hp-text').innerText();
  await page.waitForTimeout(1300);
  await expect(page.locator('#hp-text')).toHaveText(hp);
});
