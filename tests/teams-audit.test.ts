import { describe, expect, test } from 'vitest';
import { Battle } from '../src/teams/Battle';
import {
  audienceEventSchema,
  MAX_FIGHTERS,
  type AudienceEvent,
  type TeamGift,
} from '../src/teams/contracts';
import { Store } from '../server/store';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const red = { id: 'r', name: 'Red viewer' },
  blue = { id: 'b', name: 'Blue viewer' };
function arena() {
  const b = new Battle(() => 0.5);
  b.apply({ id: 'r', type: 'chat', viewer: red, message: 'red' });
  b.apply({ id: 'b', type: 'chat', viewer: blue, message: 'blue' });
  return b;
}
const gift = (name: TeamGift, amount = 1): Extract<AudienceEvent, { type: 'gift' }> => ({
  id: `gift-${name}`,
  type: 'gift',
  viewer: red,
  gift: name,
  amount,
});
const like = (count: number, viewer = red): AudienceEvent => ({
  id: 'likes',
  type: 'like',
  viewer,
  count,
});

describe('audited game interaction cases', () => {
  test.each(['reinforce', 'shield', 'meteor', 'boost'] as const)(
    'valid quantities for %s stay inside game limits',
    (name) => {
      for (const amount of [1, 20]) {
        const b = arena();
        expect(b.apply(gift(name, amount)).accepted).toBe(true);
        expect(b.state.fighters.length).toBeLessThanOrEqual(MAX_FIGHTERS);
        expect(b.state.shields.red).toBeLessThanOrEqual(18);
        expect(b.state.boosts.red).toBeLessThanOrEqual(24);
        for (const f of b.state.fighters) {
          expect(f.hp).toBeGreaterThanOrEqual(0);
          expect(f.hp).toBeLessThanOrEqual(f.maxHp);
        }
      }
    },
  );
  test.each([
    [' red ', 'red'],
    ['RED', 'red'],
    ['1', 'red'],
    ['blue', 'blue'],
    [' Blue ', 'blue'],
    ['2', 'blue'],
  ] as const)('chat %s selects %s without duplicating a viewer', (message, team) => {
    const b = arena();
    for (let i = 0; i < 3; i++)
      expect(b.apply({ id: 'chat', type: 'chat', viewer: red, message }).accepted).toBe(true);
    expect(b.state.fighters.filter((f) => f.ownerId === red.id)).toHaveLength(1);
    expect(b.state.fighters.find((f) => f.ownerId === red.id)?.team).toBe(team);
  });
  test('ordinary chat, arrivals and actions from unassigned viewers do not give team powers', () => {
    const b = new Battle();
    expect(b.apply({ id: 'hello', type: 'viewerJoined', viewer: red }).accepted).toBe(true);
    expect(
      b.apply({ id: 'chat', type: 'chat', viewer: red, message: 'hello everyone' }).accepted,
    ).toBe(false);
    expect(b.apply(like(100)).accepted).toBe(false);
    expect(b.apply({ id: 'follow', type: 'follow', viewer: red }).accepted).toBe(false);
    expect(b.apply(gift('shield')).accepted).toBe(false);
    expect(b.state.fighters).toHaveLength(0);
    expect(b.state.boosts.red).toBe(0);
  });
  test.each([
    [49, 0],
    [50, 2],
    [149, 2],
    [150, 4],
    [349, 4],
    [350, 6],
    [1_000_000, 6],
  ])('%i likes give +%i personal damage', (count, power) => {
    const b = arena();
    b.apply(like(count));
    expect(b.state.fighters[0].likePower ?? 0).toBe(power);
    expect(b.state.fighters[1].likePower).toBeUndefined();
  });
  test('viewers on the same team progress independently across like batches', () => {
    const b = arena();
    const second = { id: 'r2', name: 'Second red' };
    b.apply({ id: 'r2', type: 'join', viewer: second, team: 'red' });
    b.apply(like(49));
    b.apply(like(49, second));
    b.apply(like(1));
    expect(b.state.fighters[0].likePower).toBe(2);
    expect(b.state.fighters[2].likePower).toBeUndefined();
    b.apply(like(301, second));
    expect(b.state.fighters[2].likePower).toBe(6);
    expect(b.state.fighters[0].likePower).toBe(2);
  });
  test('gift power still doubles base damage for the team, with the personal bonus added once', () => {
    const b = arena();
    b.apply(gift('boost', 3));
    b.apply(like(100));
    expect(b.state.boosts.red).toBe(24);
    b.apply(gift('boost', 20));
    expect(b.state.boosts.red).toBe(24);
    const [r, bl] = b.state.fighters;
    Object.assign(r, { x: 190, y: 300, cooldown: 0 });
    Object.assign(bl, { x: 290, y: 300, cooldown: 99 });
    b.update(0.05);
    expect(bl.hp).toBe(74);
  });
  test('team changes preserve wounds and cannot resurrect defeated fighters', () => {
    const b = arena(),
      r = b.state.fighters[0];
    r.hp = 13;
    b.apply({ id: 'switch1', type: 'chat', viewer: red, message: 'blue' });
    expect(r.hp).toBe(13);
    r.hp = 0;
    r.respawn = 2;
    b.apply({ id: 'switch2', type: 'chat', viewer: red, message: 'red' });
    expect(r.hp).toBe(0);
    expect(r.respawn).toBe(2);
  });
  test('follow heals only living teammates up to maximum HP, without reviving anybody', () => {
    const b = arena();
    b.apply(gift('reinforce'));
    const [r, bl, ally, dead] = b.state.fighters;
    r.hp = 95;
    bl.hp = 10;
    ally.hp = 30;
    dead.hp = 0;
    dead.respawn = 2;
    b.apply({ id: 'follow', type: 'follow', viewer: red });
    expect(r.hp).toBe(100);
    expect(bl.hp).toBe(10);
    expect(ally.hp).toBe(55);
    expect(dead.hp).toBe(0);
  });
  test('shields cap and expire, and reduce both ordinary and meteor damage', () => {
    const b = arena();
    b.apply({ ...gift('shield', 20), team: 'blue' });
    expect(b.state.shields.blue).toBe(18);
    b.apply(gift('meteor'));
    expect(b.state.fighters[1].hp).toBeCloseTo(86.25);
    const [r, bl] = b.state.fighters;
    Object.assign(r, { x: 190, y: 300, cooldown: 0 });
    Object.assign(bl, { x: 290, y: 300, cooldown: 99 });
    b.update(0.05);
    expect(bl.hp).toBeCloseTo(83.25);
    for (let i = 0; i < 400; i++) b.update(0.05);
    expect(b.state.shields.blue).toBe(0);
  });
  test('meteor affects at most ten opponents, never teammates; repeated damage cannot credit one death twice', () => {
    const b = arena();
    for (let i = 0; i < 12; i++)
      b.apply({ id: `b${i}`, type: 'join', viewer: { id: `b${i}`, name: 'Blue' }, team: 'blue' });
    b.apply(gift('meteor', 20));
    expect(b.state.scores.red).toBe(10);
    expect(b.state.fighters[0].hp).toBe(100);
    b.apply(gift('meteor', 20));
    expect(b.state.scores.red).toBe(13);
    b.apply(gift('meteor', 20));
    expect(b.state.scores.red).toBe(13);
  });
  test('an explicitly selected gift team cannot award kills to a sender from the opposite team', () => {
    const b = arena();
    b.apply({ ...gift('meteor', 20), team: 'blue' });
    expect(b.state.scores.blue).toBe(1);
    expect(b.state.fighters[0].kills).toBe(0);
  });
  test('temporary reinforcements disappear after defeat; ally capacity reports explicit cosmetic acknowledgement', () => {
    const b = arena();
    b.apply(gift('reinforce'));
    const ids = b.state.fighters.filter((f) => f.temporary).map((f) => f.id);
    for (const f of b.state.fighters.filter((f) => f.temporary)) {
      f.hp = 0;
      f.respawn = 0.01;
    }
    b.update(0.05);
    expect(b.state.fighters.some((f) => ids.includes(f.id))).toBe(false);
    for (let i = 0; i < MAX_FIGHTERS; i++)
      b.apply({
        id: `viewer${i}`,
        type: 'join',
        viewer: { id: `v${i}`, name: 'Viewer' },
        team: 'red',
      });
    expect(b.apply(gift('reinforce'))).toMatchObject({
      accepted: true,
      status: 'cosmetic',
      details: { spawned: 0 },
    });
    expect(b.state.fighters).toHaveLength(MAX_FIGHTERS);
    b.restart();
    expect(
      b.apply({
        id: 'late-viewer',
        type: 'join',
        viewer: { id: 'late', name: 'Late viewer' },
        team: 'blue',
      }).accepted,
    ).toBe(false);
  });
  test('pure combat freezes on pause and delegates intermission delivery to the durable server inbox', () => {
    const b = arena();
    b.apply(gift('shield'));
    b.state.paused = true;
    b.update(0.1);
    expect(b.state.shields.red).toBe(6);
    b.state.phase = 'result';
    const before = structuredClone(b.state);
    for (const name of ['shield', 'boost', 'reinforce', 'meteor'] as const)
      expect(b.apply(gift(name)).accepted).toBe(false);
    expect(b.state).toEqual(before);
  });
  test('raw TikTok gifts, unknown gift names and large streaks require a connector adapter', () => {
    expect(
      audienceEventSchema.safeParse({ ...gift('boost'), gift: 'Rose', giftId: 5655 }).success,
    ).toBe(false);
    expect(audienceEventSchema.safeParse({ ...gift('boost'), amount: 1_000_001 }).success).toBe(
      false,
    );
    expect(audienceEventSchema.safeParse({ ...gift('boost'), amount: 0 }).success).toBe(false);
    expect(audienceEventSchema.safeParse({ ...gift('boost'), amount: 1.1 }).success).toBe(false);
  });
  test('raw cumulative counters cannot be silently discarded while defaulting a gift to one unit', () => {
    expect(
      audienceEventSchema.safeParse({
        id: 'raw-streak',
        type: 'gift',
        viewer: red,
        gift: 'boost',
        repeatCount: 20,
        repeatEnd: true,
      }).success,
    ).toBe(false);
    expect(
      audienceEventSchema.safeParse({
        id: 'raw-like',
        type: 'like',
        viewer: red,
        count: 1,
        totalLikeCount: 10000,
      }).success,
    ).toBe(false);
  });
});

describe('audited durable event handling', () => {
  test('retries with reordered fields are idempotent; reused IDs with different quantities are rejected', () => {
    const s = new Store(':memory:'),
      b = arena();
    try {
      s.ingest(b, gift('reinforce'));
      const count = b.state.fighters.length;
      const reordered = {
        amount: 1,
        gift: 'reinforce' as const,
        viewer: { name: red.name, id: red.id },
        type: 'gift' as const,
        id: 'gift-reinforce',
      };
      expect(s.ingest(b, reordered)).toMatchObject({ accepted: true, duplicate: true });
      expect(s.ingest(b, gift('reinforce', 2))).toMatchObject({ accepted: false, duplicate: true });
      expect(b.state.fighters).toHaveLength(count);
    } finally {
      s.close();
    }
  });
  test('intermission gifts are queued durably and apply once in the next round', () => {
    const s = new Store(':memory:'),
      b = arena();
    try {
      b.state.phase = 'result';
      expect(s.ingest(b, gift('boost'))).toMatchObject({ accepted: true, status: 'queued' });
      s.restart(b);
      expect(s.ingest(b, gift('boost'))).toMatchObject({
        accepted: true,
        status: 'applied',
        duplicate: true,
      });
      expect(b.state.boosts.red).toBe(8);
    } finally {
      s.close();
    }
  });
  test('existing databases migrate without losing saved receipt compatibility', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-audit-')),
      path = join(dir, 'legacy.sqlite');
    const db = new DatabaseSync(path);
    db.exec(
      'CREATE TABLE events (id TEXT PRIMARY KEY,result TEXT NOT NULL,created INTEGER NOT NULL)',
    );
    db.prepare('INSERT INTO events VALUES (?,?,?)').run('legacy', '{"accepted":true}', Date.now());
    db.close();
    const s = new Store(path);
    try {
      expect(s.ingest(arena(), { ...gift('boost'), id: 'legacy' })).toMatchObject({
        accepted: true,
        duplicate: true,
      });
    } finally {
      s.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
