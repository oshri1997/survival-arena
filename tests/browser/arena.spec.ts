import { test, expect, type Page } from '@playwright/test';
const begin = async (page: Page, session: string) => {
  await page.goto(`/?session=${session}`);
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'running');
};
const connect = async (page: Page, session: string) => {
  const admin = await page.context().newPage();
  await admin.goto(`/admin.html?session=${session}`);
  await expect(admin.locator('#connection')).toHaveText('Game connected');
  return admin;
};

test('opens directly into gameplay, fills the screen and keeps admin outside the arena', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await begin(page, `layout-${info.project.name}`);
  await expect(page.locator('#phaser-game canvas')).toBeVisible();
  expect(await page.locator('h1,aside,dialog,iframe,.site-header,.studio-panel').count()).toBe(0);
  expect(await page.locator('#score,#kills,#timer,#wave-name').count()).toBe(0);
  for (const viewport of [
    info.project.name === 'iphone-webkit'
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () =>
        page
          .locator('#phaser-game canvas')
          .evaluate((c) =>
            Math.max(
              Math.abs(c.getBoundingClientRect().width - innerWidth),
              Math.abs(c.getBoundingClientRect().height - innerHeight),
            ),
          ),
      )
      .toBeLessThan(2);
    const coverage = await page.locator('#phaser-game canvas').evaluate((c) => {
      const r = c.getBoundingClientRect();
      return (r.width * r.height) / (innerWidth * innerHeight);
    });
    expect(coverage).toBeGreaterThanOrEqual(0.8);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: `test-results/${info.project.name}-gameplay.png` });
  expect(errors).toEqual([]);
});

test('separate admin controls the same game: gifts, combat scoring, pause and chat', async ({
  page,
}, info) => {
  const session = `studio-${info.project.name}`;
  await begin(page, session);
  const admin = await connect(page, session);
  await admin.locator('[data-gift="meteor"]').click();
  await expect(admin.locator('#activity-feed')).toContainText('sent meteor');
  await expect
    .poll(async () => parseInt((await admin.locator('#admin-kills').innerText()).split(' ')[0]))
    .toBeGreaterThan(0);
  await expect(page.locator('#gift-toast')).toContainText('METEOR!');
  await admin.locator('[data-command="pause"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'paused');
  await expect(page.locator('#run-message')).toHaveText('PAUSED');
  await admin.locator('[data-command="resume"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'running');
  await admin.locator('[data-gift="crown"]').click();
  await expect(page.locator('#moment')).toContainText('BOSS');
  await admin.locator('#event-type').selectOption('ChatMessage');
  await admin
    .getByRole('textbox', { name: 'Mock chat message' })
    .fill('<img src=x onerror=alert(1)>');
  await admin.getByRole('button', { name: 'Send event', exact: true }).click();
  await expect(admin.locator('#activity-feed')).toContainText('<img src=x onerror=alert(1)>');
  expect(await admin.locator('#activity-feed img').count()).toBe(0);
  await admin.getByRole('button', { name: 'Simulate a crowd' }).click();
  await expect(admin.locator('#activity-feed')).toContainText('followed');
  await admin.screenshot({ path: `test-results/${info.project.name}-admin.png`, fullPage: true });
  await admin.close();
});

test('touch interactions trigger visible freeze, healing, meteor and boss effects', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await begin(page, `touch-${info.project.name}`);
  await page.getByRole('button', { name: 'Simulate Ice heart', exact: true }).click();
  await expect(page.locator('#gift-toast')).toContainText('FROZEN!');
  await page.getByRole('button', { name: 'Simulate Rose', exact: true }).click();
  await expect(page.locator('#gift-toast')).toContainText('+25 HP');
  await page.getByRole('button', { name: 'Simulate Meteor', exact: true }).click();
  await expect(page.locator('#gift-toast')).toContainText('METEOR!');
  await page.getByRole('button', { name: 'Simulate Crown', exact: true }).click();
  await expect(page.locator('#moment')).toHaveText('BOSS!');
  expect(errors).toEqual([]);
});

test('local storage fallback connects admin when BroadcastChannel is unavailable', async ({
  page,
}, info) => {
  await page
    .context()
    .addInitScript(() =>
      Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true }),
    );
  const session = `fallback-${info.project.name}`;
  await begin(page, session);
  const admin = await connect(page, session);
  await admin.locator('[data-command="pause"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'paused');
  await admin.locator('[data-command="resume"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'running');
  await admin.close();
});
