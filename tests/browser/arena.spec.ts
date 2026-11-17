import { test, expect, type Page } from '@playwright/test';
const begin = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the arena' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'running');
};
const studio = async (page: Page) => {
  const open = page.getByRole('button', { name: 'Open broadcaster controls' });
  if (await open.isVisible()) await open.click();
};

test('boots original animated arena, starts real combat, scores and pauses', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Enter the arena' })).toBeEnabled();
  await expect(page.locator('#phaser-game canvas')).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-welcome.png`, fullPage: true });
  await page.getByRole('button', { name: 'Enter the arena' }).click();
  await expect
    .poll(async () => Number((await page.locator('#kills').innerText()).replaceAll(',', '')), {
      timeout: 25000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => Number((await page.locator('#score').innerText()).replaceAll(',', '')))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await expect(page.getByText('The light can wait.')).toBeVisible();
  const timer = await page.locator('#timer').innerText();
  await page.waitForTimeout(1200);
  await expect(page.locator('#timer')).toHaveText(timer);
  await page.getByRole('button', { name: 'Return to the arena' }).click();
  await page.screenshot({ path: `test-results/${info.project.name}-gameplay.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('casts three spells and enforces cooldowns', async ({ page }) => {
  await begin(page);
  for (const name of ['Fire Nova', 'Frost Ward', 'Arc Lightning']) {
    const button = page.getByRole('button', { name: `${name}, ready`, exact: true });
    await button.click();
    await expect(
      page.getByRole('button', { name: new RegExp(`${name}, ready in`) }),
    ).toBeDisabled();
  }
  await expect(page.locator('#wave-progress-label')).toContainText('FROZEN');
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
});

test('mock gifts summon a boss and all event types work without a network connector', async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== 'http://127.0.0.1:4173')
      requests.push(request.url());
  });
  await begin(page);
  await studio(page);
  await page.locator('[data-gift="crown"]').click();
  await expect(page.locator('#boss-health')).toBeVisible();
  await expect(page.locator('#gift-count')).toHaveText('1');
  await page.locator('#studio-panel').evaluate((panel) => {
    panel.scrollTop = panel.scrollHeight;
  });
  await page.locator('.event-tools summary').click();
  await page.getByRole('button', { name: 'Simulate a crowd' }).click();
  await expect(page.locator('#viewers')).toHaveText('4');
  await expect(page.locator('#likes')).toHaveText('25');
  await expect(page.locator('#gift-count')).toHaveText('2');
  await expect(page.locator('#event-count')).toHaveText('9 EVENTS');
  await page.locator('#event-type').selectOption('ChatMessage');
  await page
    .getByRole('textbox', { name: 'Mock chat message' })
    .fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Send event', exact: true }).click();
  await expect(
    page.locator('#activity-feed').getByText('<img src=x onerror=alert(1)>', { exact: false }),
  ).toBeVisible();
  expect(await page.locator('#activity-feed img').count()).toBe(0);
  await page.screenshot({ path: `test-results/${info.project.name}-studio.png`, fullPage: true });
  expect(requests).toEqual([]);
});

test('keeps a 9:16 playfield without horizontal overflow and supports a clean broadcast view', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Enter the arena' })).toBeEnabled();
  const box = await page.locator('#arena-frame').boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.width / box!.height - 9 / 16)).toBeLessThan(0.005);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/?broadcast=1');
  await expect(page.getByRole('button', { name: 'Enter the arena' })).toBeEnabled();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('#studio-panel')).toBeHidden();
  const broadcast = await page.locator('#arena-frame').boundingBox();
  expect(Math.abs(broadcast!.width / broadcast!.height - 9 / 16)).toBeLessThan(0.005);
  await page.getByRole('button', { name: 'Enter the arena' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'running');
});
