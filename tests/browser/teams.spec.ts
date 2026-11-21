import { test, expect, type Page } from '@playwright/test';
import { Battle } from '../../src/teams/Battle';

async function chooseDemoTeam(page: Page, team: 'red' | 'blue') {
  await page.locator('#demo-join summary').click();
  await page.getByRole('button', { name: `Join ${team} in demo` }).click();
}

test('the live arena shows viewer interactions, then clears its roster and timer when the broadcast ends', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const battle = new Battle();
  battle.apply({
    id: 'join',
    type: 'join',
    viewer: { id: 'red', name: 'Red Viewer' },
    team: 'red',
  });
  const active = { ...battle.state, live: 'live', connected: true, demoJoin: false };
  battle.resetSession();
  const waiting = { ...battle.state, live: 'waiting', connected: true, demoJoin: false };
  let endBroadcast: (() => void) | undefined;
  let welcomeViewer: (() => void) | undefined;
  await page.routeWebSocket('**/api/teams/socket', (socket) => {
    socket.send(JSON.stringify({ type: 'state', state: active }));
    welcomeViewer = () =>
      socket.send(
        JSON.stringify({
          type: 'state',
          state: {
            ...active,
            giftOverrides: { '5659': 'heal' },
            rallyLikes: { red: 50, blue: 0 },
            activity: [
              {
                id: active.sequence + 2,
                kind: 'welcome',
                name: '@red.viewer',
                text: 'Type RED or BLUE to join',
              },
              {
                id: active.sequence + 1,
                kind: 'gift',
                name: 'Gift Viewer',
                text: 'sent meteor',
                gift: 'meteor',
                giftDetail: 'No living opponents to hit',
              },
            ],
          },
        }),
      );
    endBroadcast = () => socket.send(JSON.stringify({ type: 'state', state: waiting }));
  });
  await page.goto('/teams.html');
  await expect(page.locator('#team-game canvas')).toBeVisible();
  await expect(page.locator('#red-count')).toHaveText('1 players');
  await expect(page.locator('#clock')).toHaveText('4:00');
  const guide = page.locator('.gift-guide');
  await expect(guide.locator('li')).toHaveCount(10);
  await expect(page.getByRole('button', { name: /join (red|blue)/i })).toHaveCount(0);
  await expect(page.locator('#chat-help')).toContainText('Chat red or blue to join');
  await expect(guide.locator('ul')).toHaveCSS('background-color', 'rgba(15, 24, 43, 0.38)');
  expect(
    await guide.evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return (
        bounds.top >= innerHeight * 0.58 &&
        Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2) < 3 &&
        bounds.bottom <= innerHeight
      );
    }),
  ).toBe(true);
  await expect(guide.locator('[data-live-gift="5659"]')).toContainText('75% shield · 6s');
  await expect(guide.locator('li').last()).toBeInViewport({ ratio: 1 });
  expect(await guide.locator('ul').evaluate((list) => list.scrollHeight)).toBeLessThanOrEqual(
    await guide.locator('ul').evaluate((list) => list.clientHeight),
  );
  welcomeViewer?.();
  await expect(page.locator('#viewer-welcome')).toHaveText(
    '@red.viewer · Type RED or BLUE to join',
  );
  await expect(page.locator('#red-rally')).toHaveText('♥ 50/200');
  await expect(page.locator('#team-notice.gift')).toContainText('Gift Viewer sent meteor');
  await expect(page.locator('#team-notice.gift')).toContainText('No living opponents to hit');
  await expect(page.locator('#team-notice img')).toHaveAttribute('src', '/assets/fireball.png');
  await expect(guide.locator('[data-live-gift="5659"]')).toContainText('Team heal · 20 HP');
  await expect(guide.locator('[data-live-gift="11046"]')).toContainText('55 DMG · up to 10 foes');
  await expect(guide.locator('[data-live-gift="6104"]')).toContainText('2× base damage · 8s');
  await expect
    .poll(() =>
      page
        .locator('.gift-guide img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await guide.locator('summary').click();
  await expect(guide.locator('ul')).toBeHidden();
  await guide.locator('summary').click();
  await expect(guide.locator('li').last()).toBeVisible();
  endBroadcast?.();
  await expect(page.locator('#mode')).toHaveText('WAITING FOR LIVE');
  await expect(page.locator('#red-count')).toHaveText('0 players');
  await expect(page.locator('#clock')).toHaveText('—');
  await expect(page.locator('.join-controls')).toBeHidden();
});

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
      expect(
        await page
          .locator('.gift-guide li b')
          .first()
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe('20px');
    }
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await chooseDemoTeam(page, 'red');
  await expect(page.locator('#join-hint')).toHaveText('YOU’RE ON RED');
  await chooseDemoTeam(page, 'blue');
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
  // Keep old WebSocket snapshots flowing while the setting request is deliberately delayed.
  await admin.route('**/api/teams/admin/actions', async (route) => {
    if (route.request().postDataJSON().type === 'autoplay')
      await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await admin.locator('#autoplay').uncheck();
  await expect(admin.locator('#autoplay')).not.toBeChecked();
  await expect(admin.locator('#autoplay')).toBeEnabled();
  await admin.unroute('**/api/teams/admin/actions');
  await admin.getByRole('button', { name: 'New round', exact: true }).click();
  await admin.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await expect(other.locator('body')).toHaveAttribute('data-phase', 'paused');
  await admin.locator('#viewer-id').fill(`browser-${info.project.name}`);
  await admin.locator('#viewer-name').fill('Team Explorer');
  await admin.getByRole('button', { name: 'Join team', exact: true }).click();
  await expect(admin.locator('#roster')).toContainText('Team Explorer');
  await admin.getByRole('button', { name: '50 likes', exact: true }).click();
  await expect(page.locator('#viewer-welcome')).toHaveText('Team Explorer · unlocked +2 damage');
  await expect(other.locator('#viewer-welcome')).toHaveText('Team Explorer · unlocked +2 damage');
  await expect(page.locator('#red-power')).toBeHidden();
  await expect(page.locator('#blue-power')).toBeHidden();
  await admin.getByRole('button', { name: 'Shield', exact: false }).click();
  await expect(admin.locator('#action-result')).toContainText('QUEUED');
  await expect(admin.locator('#pending-count')).toContainText('1 queued');
  await admin.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(admin.locator('#pending-count')).toContainText('0 queued');
  await expect(page.locator('#team-notice')).toContainText('sent shield');
  await expect(other.locator('#team-notice')).toContainText('sent shield');
  await admin.getByRole('button', { name: 'Reinforcements', exact: false }).click();
  await expect(admin.locator('#event-feed')).toContainText('sent reinforce');
  await admin.getByRole('button', { name: 'Meteor', exact: false }).click();
  await expect(page.locator('#team-notice')).toContainText('sent meteor');
  await admin.locator('button[data-team-gift="boost"]').click();
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
  await expect(page.getByRole('button', { name: /join (red|blue) in demo/i })).toHaveCount(0);
  await chooseDemoTeam(page, 'blue');
  await expect(page.locator('#join-hint')).toHaveText('YOU’RE ON BLUE');
  await expect(page.locator('#blue-count')).toHaveText('13 players');
  await expect(page.locator('#team-notice')).toContainText(/sent (shield|meteor|boost|reinforce)/, {
    timeout: 30000,
  });
  expect(apiRequests).toEqual([]);
  if (info.project.name === 'iphone-webkit')
    await page.screenshot({ path: `test-results/${info.project.name}-teams-demo.png` });
});

test('admin tracks a gift before team selection, delivers after resume and safely saves catalog mapping', async ({
  page,
}, info) => {
  const root = `http://127.0.0.1:${info.project.name === 'iphone-webkit' ? 8788 : 8787}`;
  await page.goto(root + '/teams-admin.html');
  await page.locator('#admin-key').fill('browser-test-admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-connected', 'true');
  await page.locator('#autoplay').uncheck();
  await page.getByRole('button', { name: 'New round', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('#viewer-id').fill(`pending-${info.project.name}`);
  await page.locator('#viewer-name').fill('Waiting Explorer');
  await page.locator('#gift-use-team').uncheck();
  await page.locator('button[data-team-gift="shield"]').click();
  await expect(page.locator('#action-result')).toContainText('Waiting for the viewer');
  await expect(page.locator('#pending-count')).toContainText('1 queued');
  await page.reload();
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#gift-receipts')).toContainText('Waiting Explorer');
  await expect(page.locator('#pending-count')).toContainText('1 queued');
  await page.locator('#viewer-id').fill(`pending-${info.project.name}`);
  await page.locator('#viewer-name').fill('Waiting Explorer');
  await page.locator('#chat').fill('blue');
  await page.getByRole('button', { name: 'Send chat', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('#pending-count')).toContainText('0 queued');
  await expect(page.locator('#gift-receipts')).toContainText('APPLIED · Waiting Explorer');
  await page.locator('#catalog-id').fill('<img src=x onerror=alert(1)>');
  await page.locator('#catalog-action').selectOption('boost');
  await page.getByRole('button', { name: 'Save mapping', exact: true }).click();
  await expect(page.locator('#catalog-summary')).toContainText('<img src=x onerror=alert(1)>');
  expect(await page.locator('#controls img').count()).toBe(0);
  await expect(page.locator('#live-status')).toContainText('DISABLED');
  await page.locator('#viewer-id').fill(`thanks-${info.project.name}`);
  await page.locator('#gift-use-team').uncheck();
  await page.locator('#gift-amount').fill('21');
  await page.locator('button[data-team-gift="thanks"]').click();
  await expect(page.locator('#action-result')).toContainText('COSMETIC');
  await expect(page.locator('#action-result')).toContainText('21');
  await expect(page.locator('#pending-count')).toContainText('0 queued');
});

test('a waiting viewer is promoted when a full arena rotates into the next round', async ({
  page,
}) => {
  const root = `http://127.0.0.1:${test.info().project.name === 'iphone-webkit' ? 8788 : 8787}`;
  await page.goto(root + '/teams-admin.html');
  await page.locator('#admin-key').fill('browser-test-admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#controls')).toBeVisible();
  const action = async (input: unknown) => {
    const response = await page.request.post(root + '/api/teams/admin/actions', { data: input });
    expect(response.ok()).toBe(true);
  };
  await action({ type: 'autoplay', enabled: false });
  await action({ type: 'pause', paused: true });
  await action({ type: 'restart' });
  for (let i = 0; i < 4; i++) await action({ type: 'crowd', count: 20 });
  const viewer = await page.context().newPage();
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.goto(root + '/teams.html');
  await expect(viewer.locator('body')).toHaveAttribute('data-connected', 'true');
  await chooseDemoTeam(viewer, 'red');
  await expect(viewer.locator('#join-hint')).toHaveText('REGISTERED · YOUR TURN IS COMING');
  await action({ type: 'restart' });
  await expect(viewer.locator('#join-hint')).toHaveText('YOU’RE ON RED');
  await viewer.close();
});
