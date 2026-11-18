import { test, expect } from '@playwright/test';

test('audience sees a queued strike fire and a boss attack interrupted', async ({ page }, info) => {
  const session = `counter-${info.project.name}`;
  await page.goto(`http://127.0.0.1:5175/?session=${session}`);
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'running');
  await page.evaluate(async (session) => {
    const entry = '/src/main.ts';
    const { rules } = (await import(entry)) as typeof import('../../src/main');
    rules.state.cooldowns.lightning = 30;
    const channel = new BroadcastChannel(`survival-arena:${session}`);
    channel.postMessage({
      type: 'command',
      command: {
        kind: 'event',
        event: {
          type: 'LikeReceived',
          source: 'mock',
          id: 'test-likes',
          viewer: { id: 'viewer', name: 'Luna' },
          at: Date.now(),
          count: 20,
        },
      },
    });
    channel.close();
  }, session);
  await expect(page.locator('#gift-toast')).toContainText('LIGHTNING CHARGED');
  await page.evaluate(async () => {
    const entry = '/src/main.ts';
    const { rules } = (await import(entry)) as typeof import('../../src/main');
    rules.summonBoss();
    rules.state.cooldowns.lightning = 0;
  });
  await expect(page.locator('#gift-toast')).toContainText('LIGHTNING!');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const entry = '/src/main.ts';
        const { rules, game } = (await import(entry)) as typeof import('../../src/main');
        const boss = rules.state.enemies.find((enemy) => enemy.kind === 'boss')!;
        const children = game.scene
          .getScene('Arena')
          .children.getChildren() as Phaser.GameObjects.Sprite[];
        const sprite = children.find((child) => child.texture?.key === 'boss');
        return sprite ? Math.hypot(sprite.x - boss.x, sprite.y - boss.y) : Infinity;
      }),
    )
    .toBeLessThan(1);
  await page.evaluate(async () => {
    const entry = '/src/main.ts';
    const { rules } = (await import(entry)) as typeof import('../../src/main');
    const boss = rules.state.enemies.find((enemy) => enemy.kind === 'boss')!;
    boss.windup = boss.windupDuration = 8;
  });
  await page.getByRole('button', { name: 'Simulate Ice heart', exact: true }).click();
  await expect(page.locator('#gift-toast')).toContainText('ATTACK STOPPED');
});

test('Arcade contact matches enlarged sprites, freeze protects the crystal and upgrades do not open menus', async ({
  page,
}, info) => {
  await page.goto(`http://127.0.0.1:5175/?session=physics-${info.project.name}`);
  await expect(page.locator('body')).toHaveAttribute('data-game-status', 'running');
  await page.evaluate(async () => {
    const entry = '/src/main.ts';
    const { rules } = (await import(entry)) as typeof import('../../src/main');
    rules.state.enemies = [];
    const e = rules.spawn('skeleton');
    e.x = rules.state.player.x;
    e.y = rules.state.player.y;
    e.hp = 10000;
    rules.state.spawnRemaining = 0;
  });
  await expect
    .poll(async () => parseInt(await page.locator('#hp-text').innerText()))
    .toBeLessThan(100);
  await page.getByRole('button', { name: 'Simulate Ice heart', exact: true }).click();
  const health = await page.locator('#hp-text').innerText();
  await page.waitForTimeout(1200);
  await expect(page.locator('#hp-text')).toHaveText(health);
  await page.evaluate(async () => {
    const entry = '/src/main.ts';
    const { rules } = (await import(entry)) as typeof import('../../src/main');
    rules.state.enemies = [];
    rules.state.shots = [];
    rules.state.spawnRemaining = 0;
    rules.state.waveBreak = 1.1;
  });
  await expect.poll(async () => Number(await page.locator('#wave').innerText())).toBe(2);
  expect(await page.locator('dialog,.upgrade-list,.game-overlay').count()).toBe(0);
});
