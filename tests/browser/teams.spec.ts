import { test, expect } from '@playwright/test';

test('networked team battle fills mobile screen; separate authenticated admin sends working events across browsers', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const root = `http://127.0.0.1:${info.project.name === 'iphone-webkit' ? 8788 : 8787}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(root + '/teams.html');
  await expect(page.locator('body')).toHaveAttribute('data-connected', 'true');
  await expect(page.locator('#team-game canvas')).toBeVisible();
  expect(await page.locator('h1,aside,dialog,.control-room').count()).toBe(0);
  for (const size of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1080, height: 1920 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.locator('#team-game canvas').evaluate((canvas) => {
          const r = canvas.getBoundingClientRect();
          return (
            Math.abs(r.width - innerWidth) +
            Math.abs(r.height - (visualViewport?.height || innerHeight))
          );
        }),
      )
      .toBeLessThan(3);
    // Safari can update the visual viewport before its layout viewport during rotation.
    await expect
      .poll(() =>
        page
          .locator('#team-game canvas')
          .evaluate(
            (c) =>
              (c.clientWidth * c.clientHeight) /
              ((visualViewport?.width || innerWidth) * (visualViewport?.height || innerHeight)),
          ),
      )
      .toBeGreaterThanOrEqual(0.8);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      )
      .toBe(true);
    if (size.height === 1920) {
      expect(await page.locator('#red-share').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
        '90px',
      );
      expect(await page.locator('.join-red').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
        '25px',
      );
    }
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole('button', { name: 'JOIN RED' }).click();
  await expect(page.locator('#join-hint')).toHaveText('YOU’RE ON RED');
  await page.getByRole('button', { name: 'JOIN BLUE' }).click();
  await expect(page.locator('#join-hint')).toHaveText('YOU’RE ON BLUE');
  const otherContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const other = await otherContext.newPage();
  await other.goto(root + '/teams.html');
  await expect(other.locator('body')).toHaveAttribute('data-connected', 'true');
  const admin = await page.context().newPage();
  admin.on('pageerror', (e) => errors.push(e.message));
  await admin.goto(root + '/teams-admin.html');
  await expect(admin.locator('#login-panel')).toBeVisible();
  await expect(admin.locator('#controls')).toBeHidden();
  await admin.locator('#admin-key').fill('browser-test-admin');
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin.locator('#controls')).toBeVisible();
  await expect(admin.locator('body')).toHaveAttribute('data-connected', 'true');
  await admin.locator('#autoplay').uncheck();
  await admin.getByRole('button', { name: 'New round', exact: true }).click();
  await admin.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await expect(other.locator('body')).toHaveAttribute('data-phase', 'paused');
  await admin.locator('#viewer-id').fill(`browser-${info.project.name}`);
  await admin.locator('#viewer-name').fill('Team Explorer');
  await admin.getByRole('button', { name: 'Join team', exact: true }).click();
  await expect(admin.locator('#roster')).toContainText('Team Explorer');
  await admin.getByRole('button', { name: 'Shield', exact: false }).click();
  await expect(page.locator('#team-notice')).toContainText('sent shield');
  await expect(other.locator('#team-notice')).toContainText('sent shield');
  await admin.getByRole('button', { name: 'Reinforcements', exact: false }).click();
  await expect(admin.locator('#event-feed')).toContainText('sent reinforce');
  await admin.getByRole('button', { name: 'Meteor', exact: false }).click();
  await expect(page.locator('#team-notice')).toContainText('sent meteor');
  await admin.getByRole('button', { name: 'Power Double attack', exact: false }).click();
  await expect(admin.locator('#event-feed')).toContainText('sent boost');
  await admin.locator('#viewer-name').fill('<img src=x onerror=alert(1)>');
  await admin.locator('#chat').fill('blue');
  await admin.getByRole('button', { name: 'Send chat', exact: true }).click();
  await expect(admin.locator('#roster')).toContainText('<img src=x onerror=alert(1)>');
  expect(await admin.locator('#roster img,#event-feed img').count()).toBe(0);
  await admin.reload();
  await expect(admin.locator('#controls')).toBeVisible();
  await admin.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'battle');
  const otherBlueCount = await other.locator('#blue-count').innerText();
  await otherContext.close();
  // A disconnected viewer reconnects to the running round rather than starting a new simulation.
  const round = await page.locator('#round').textContent();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-connected', 'true');
  await expect(page.locator('#team-game canvas')).toBeVisible();
  await expect(page.locator('#round')).toHaveText(round!);
  await expect(page.locator('#blue-count')).toHaveText(otherBlueCount);
  if (info.project.name === 'iphone-webkit')
    await page.screenshot({ path: `test-results/${info.project.name}-teams.png` });
  await admin.screenshot({
    path: `test-results/${info.project.name}-teams-admin.png`,
    fullPage: true,
  });
  await admin.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(admin.locator('#login-panel')).toBeVisible();
  expect(errors).toEqual([]);
  await admin.close();
});

test('explicit static demo plays without contacting a backend and simulates gift effects', async ({
  page,
}, info) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/teams')) apiRequests.push(request.url());
  });
  await page.goto('/teams-demo.html');
  await expect(page.locator('#team-game canvas')).toBeVisible();
  await expect(page.locator('#mode')).toHaveText('LOCAL DEMO');
  await page.getByRole('button', { name: 'JOIN BLUE' }).click();
  await expect(page.locator('#join-hint')).toHaveText('YOU’RE ON BLUE');
  await expect(page.locator('#blue-count')).toHaveText('13 players');
  await expect(page.locator('#team-notice')).toContainText(/sent (shield|meteor|boost|reinforce)/, {
    timeout: 30000,
  });
  expect(apiRequests).toEqual([]);
  if (info.project.name === 'iphone-webkit')
    await page.screenshot({ path: `test-results/${info.project.name}-teams-demo.png` });
});
