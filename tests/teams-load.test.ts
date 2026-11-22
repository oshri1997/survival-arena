import { expect, test } from 'vitest';
import { Battle } from '../src/teams/Battle';
import { territoryRange } from '../src/teams/territory';
import { MAX_FIGHTERS } from '../src/teams/contracts';

test('synthetic full-arena play stays bounded through gift bursts, defeats and new rounds', () => {
  let seed = 7301;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const b = new Battle(random);
  for (let i = 0; i < MAX_FIGHTERS; i++)
    b.apply({
      id: `join-${i}`,
      type: 'join',
      viewer: { id: `v${i}`, name: `Viewer ${i}` },
      team: i % 2 ? 'blue' : 'red',
    });
  for (let tick = 0; tick < 600; tick++) {
    if (tick % 10 === 0) {
      const f = b.state.fighters[Math.floor(random() * b.state.fighters.length)];
      b.apply({
        id: `gift-${tick}`,
        type: 'gift',
        viewer: { id: f.ownerId, name: f.name },
        gift: (['shield', 'boost', 'meteor', 'reinforce'] as const)[(tick / 10) % 4],
        amount: 20,
      });
    }
    b.update(0.05);
    expect(b.state.fighters.length).toBeLessThanOrEqual(MAX_FIGHTERS);
    expect(b.state.effects.length).toBeLessThanOrEqual(90);
    expect(b.state.activity.length).toBeLessThanOrEqual(20);
    for (const f of b.state.fighters) {
      const range = territoryRange(f.team, f.y, b.state.territory, b.state.round);
      expect(Number.isFinite(f.x + f.y + f.hp)).toBe(true);
      expect(f.hp).toBeGreaterThanOrEqual(0);
      expect(f.hp).toBeLessThanOrEqual(f.maxHp);
      expect(f.x).toBeGreaterThanOrEqual(range.min - 0.001);
      expect(f.x).toBeLessThanOrEqual(range.max + 0.001);
    }
  }
}, 20000);
