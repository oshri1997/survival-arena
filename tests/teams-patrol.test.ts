import { expect, test } from 'vitest';
import { Battle } from '../src/teams/Battle';
import { Patrol } from '../src/teams/Patrol';
import { FIELD, frontierX, territoryRange } from '../src/teams/territory';
import type { Fighter } from '../src/teams/contracts';

const seeded =
  (seed = 17) =>
  () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
function crowd(count = 24) {
  const battle = new Battle(seeded());
  for (let i = 0; i < count; i++)
    battle.apply({
      id: `join-${i}`,
      type: 'join',
      team: i % 2 ? 'blue' : 'red',
      viewer: { id: `viewer-${i}`, name: `Viewer ${i}` },
    });
  return battle;
}
function inside(f: Fighter, territory: number, round: number) {
  const range = territoryRange(f.team, f.y, territory, round);
  expect(f.x).toBeGreaterThanOrEqual(range.min - 0.0001);
  expect(f.x).toBeLessThanOrEqual(range.max + 0.0001);
  expect(f.y).toBeGreaterThanOrEqual(FIELD.top);
  expect(f.y).toBeLessThanOrEqual(FIELD.bottom);
}

test('a viewer patrols even with no opponent, with gradual acceleration instead of teleporting', () => {
  const battle = new Battle(seeded());
  battle.apply({ id: 'solo', type: 'join', viewer: { id: 'solo', name: 'Solo' }, team: 'red' });
  const f = battle.state.fighters[0],
    start = { x: f.x, y: f.y };
  let distance = 0;
  for (let i = 0; i < 200; i++) {
    const before = { x: f.x, y: f.y, vx: f.vx ?? 0, vy: f.vy ?? 0 };
    battle.update(0.05);
    const step = Math.hypot(f.x - before.x, f.y - before.y);
    expect(step).toBeLessThanOrEqual(2.53);
    if (i < 5)
      expect(Math.hypot((f.vx ?? 0) - before.vx, (f.vy ?? 0) - before.vy)).toBeLessThanOrEqual(
        5.001,
      );
    distance += step;
    inside(f, battle.state.territory, battle.state.round);
  }
  expect(distance).toBeGreaterThan(150);
  expect(Math.hypot(f.x - start.x, f.y - start.y)).toBeGreaterThan(30);
});

test('fighters spread through their territory rather than collecting along the frontier', () => {
  const battle = crowd();
  for (const f of battle.state.fighters) f.hp = f.maxHp = 10000;
  let rearSamples = 0,
    frontSamples = 0,
    samples = 0;
  for (let tick = 0; tick < 600; tick++) {
    battle.update(0.05);
    for (const f of battle.state.fighters) {
      inside(f, battle.state.territory, battle.state.round);
      if (tick > 100 && tick % 20 === 0) {
        const depth = Math.abs(f.x - frontierX(f.y, battle.state.territory, battle.state.round));
        if (depth > 100) rearSamples++;
        if (depth < 60) frontSamples++;
        samples++;
      }
    }
  }
  expect(rearSamples / samples).toBeGreaterThan(0.3);
  expect(frontSamples / samples).toBeLessThan(0.45);
  expect(battle.state.effects.some((e) => e.type === 'shot')).toBe(true);
});

test('curved and shrinking territories, restored games and team switches keep avatars on their own side', () => {
  const battle = crowd();
  const patrol = new Patrol(seeded(91));
  for (const territory of [0.5, 0.25, 0.8, 0.11, 0.89]) {
    for (let tick = 0; tick < 100; tick++) {
      patrol.update(battle.state.fighters, 0.05, territory, 3);
      for (const f of battle.state.fighters) inside(f, territory, 3);
    }
  }
  battle.state.territory = 0.2;
  const restored = new Battle(seeded(), structuredClone(battle.state));
  for (const f of restored.state.fighters) inside(f, 0.2, restored.state.round);
  restored.apply({
    id: 'switch',
    type: 'chat',
    viewer: { id: 'viewer-0', name: 'Switched' },
    message: 'blue',
  });
  const f = restored.state.fighters.find((f) => f.ownerId === 'viewer-0')!;
  expect(f.team).toBe('blue');
  inside(f, 0.2, restored.state.round);
});

test('coincident allies separate without NaNs and ordinary roaming still produces kills', () => {
  const battle = crowd(10);
  const patrol = new Patrol(seeded());
  const allies = battle.state.fighters.filter((f) => f.team === 'red');
  for (const f of allies) {
    f.x = 110;
    f.y = 390;
  }
  for (let tick = 0; tick < 100; tick++) patrol.update(allies, 0.05, 0.5, 1);
  for (const f of allies) {
    expect(Number.isFinite(f.vx)).toBe(true);
    inside(f, 0.5, 1);
  }
  const spread = Math.max(...allies.map((f) => f.y)) - Math.min(...allies.map((f) => f.y));
  expect(spread).toBeGreaterThan(60);
  let kills = 0;
  const combat = crowd();
  for (let tick = 0; tick < 800; tick++) {
    combat.update(0.05);
    kills = Math.max(kills, combat.state.scores.red + combat.state.scores.blue);
  }
  expect(kills).toBeGreaterThan(3);
});
