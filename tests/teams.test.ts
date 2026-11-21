import { describe, expect, test } from 'vitest';
import { Battle } from '../src/teams/Battle';
import {
  audienceEventSchema,
  MAX_FIGHTERS,
  ROUND_SECONDS,
  type AudienceEvent,
} from '../src/teams/contracts';

const viewer = { id: 'viewer-a', name: 'Ari' };
const joined = () => {
  const battle = new Battle(() => 0.5);
  battle.apply({ id: 'red', type: 'join', viewer, team: 'red' });
  battle.apply({
    id: 'blue',
    type: 'join',
    viewer: { id: 'viewer-b', name: 'Blue' },
    team: 'blue',
  });
  return battle;
};
const advance = (battle: Battle, seconds: number) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) battle.update(0.05);
};
const gift = (
  kind: 'reinforce' | 'meteor' | 'shield' | 'boost',
): Extract<AudienceEvent, { type: 'gift' }> => ({
  id: kind,
  type: 'gift',
  viewer,
  gift: kind,
  amount: 1,
});

describe('team battle rules', () => {
  test('arrivals do not choose a team; chat commands join and switch one persistent avatar', () => {
    const battle = new Battle(() => 0.5);
    expect(battle.apply({ id: 'arrival', type: 'viewerJoined', viewer }).accepted).toBe(true);
    expect(battle.state.fighters).toHaveLength(0);
    battle.apply({ id: 'chat-1', type: 'chat', viewer, message: ' RED ' });
    battle.apply(gift('reinforce'));
    expect(battle.state.fighters).toHaveLength(4);
    battle.apply({ id: 'chat-2', type: 'chat', viewer, message: '2' });
    expect(battle.state.fighters).toHaveLength(1);
    expect(battle.state.fighters[0]).toMatchObject({ ownerId: viewer.id, team: 'blue' });
  });
  test('fighters attack, score, respawn and resolve simultaneous attacks fairly', () => {
    const battle = joined();
    const [red, blue] = battle.state.fighters;
    Object.assign(red, { x: 220, y: 300, hp: 12, cooldown: 0 });
    Object.assign(blue, { x: 280, y: 300, hp: 12, cooldown: 0 });
    battle.update(0.05);
    expect(red.hp).toBe(0);
    expect(blue.hp).toBe(0);
    expect(battle.state.scores).toEqual({ red: 1, blue: 1 });
    expect(battle.state.territory).toBeCloseTo(0.5);
    advance(battle, 3.1);
    expect(red.hp).toBeGreaterThan(0);
    expect(blue.hp).toBeGreaterThan(0);
  });
  test('shield reduces meteor damage, likes boost power, follow heals and allies obey the cap', () => {
    const battle = joined();
    const red = battle.state.fighters[0],
      blue = battle.state.fighters[1];
    battle.apply({ ...gift('shield'), team: 'blue' });
    battle.apply(gift('meteor'));
    expect(blue.hp).toBeCloseTo(100 - 55 / 4);
    battle.apply({ id: 'likes', type: 'like', viewer, count: 50 });
    expect(red.likePower).toBe(2);
    red.hp = 40;
    battle.apply({ id: 'follow', type: 'follow', viewer });
    expect(red.hp).toBe(65);
    for (let i = 0; i < 40; i++) battle.apply(gift('reinforce'));
    expect(battle.state.fighters).toHaveLength(MAX_FIGHTERS);
    expect(battle.apply(gift('reinforce'))).toMatchObject({
      accepted: true,
      status: 'cosmetic',
      details: { spawned: 0 },
    });
  });
  test('pause freezes simulation, rounds announce a winner then reset automatically and retain viewers', () => {
    const battle = joined();
    battle.state.paused = true;
    const before = structuredClone(battle.state);
    advance(battle, 2);
    expect(battle.state).toEqual(before);
    battle.state.paused = false;
    battle.state.territory = 0.91;
    battle.update(0.05);
    expect(battle.state.phase).toBe('battle');
    battle.state.remaining = 0.01;
    battle.update(0.05);
    expect(battle.state).toMatchObject({ phase: 'result', winner: 'red' });
    expect(battle.apply(gift('boost')).accepted).toBe(false);
    advance(battle, 8.1);
    expect(battle.state).toMatchObject({ round: 2, phase: 'battle', winner: null, territory: 0.5 });
    expect(battle.state.remaining).toBeGreaterThan(ROUND_SECONDS - 1);
    expect(battle.state.fighters).toHaveLength(2);
    battle.state.remaining = 0.01;
    battle.update(0.05);
    expect(battle.state.winner).toBe('draw');
    expect(battle.state.activity[0].text).toBe('Round drawn');
  });
  test('rejects unsafe avatars, non-integer gift counts and oversized incoming events', () => {
    expect(audienceEventSchema.safeParse({ ...gift('boost'), amount: 1.5 }).success).toBe(false);
    expect(audienceEventSchema.safeParse({ ...gift('boost'), amount: 1_000_001 }).success).toBe(
      false,
    );
    expect(
      audienceEventSchema.safeParse({
        ...gift('boost'),
        viewer: { ...viewer, avatar: 'javascript:alert(1)' },
      }).success,
    ).toBe(false);
    expect(
      audienceEventSchema.safeParse({
        ...gift('boost'),
        viewer: { ...viewer, avatar: 'https://user:pass@example.com/photo.png' },
      }).success,
    ).toBe(false);
    expect(
      audienceEventSchema.safeParse({ id: 'chat', type: 'chat', viewer, message: 'x'.repeat(201) })
        .success,
    ).toBe(false);
  });
});

test('personal like power follows team switches and resets at the next round', () => {
  const battle = joined();
  const [red, blue] = battle.state.fighters;
  blue.hp = 0;
  blue.respawn = 30;
  battle.apply({ id: 'early-likes', type: 'like', viewer, count: 50 });
  advance(battle, 9);
  expect(red.likePower).toBe(2);
  expect(battle.state.boosts.red).toBe(0);

  Object.assign(red, { x: 185, y: 320, cooldown: 0, hp: 100 });
  Object.assign(blue, { x: 298, y: 320, cooldown: 0, hp: 100 });
  battle.update(0.05);
  expect(red.hp).toBe(88);
  expect(blue.hp).toBe(86);
  expect(battle.state.effects).toContainEqual(
    expect.objectContaining({ type: 'shot', team: 'red', powered: true }),
  );

  battle.apply({ id: 'more-likes', type: 'like', viewer, count: 100 });
  battle.apply({ id: 'switch', type: 'chat', viewer, message: 'כחול' });
  expect(battle.state.fighters[0]).toMatchObject({ likePower: 4, team: 'blue' });
  battle.state.phase = 'result';
  expect(battle.apply({ id: 'late-likes', type: 'like', viewer, count: 100 }).accepted).toBe(false);
  battle.restart();
  expect(battle.state.viewerLikes).toBeUndefined();
  expect(battle.state.rallyLikes).toBeUndefined();
  expect(red.likePower).toBeUndefined();
  battle.replaceRoster([{ viewer, team: 'blue' }]);
  expect(battle.state.fighters[0].likePower).toBeUndefined();
  battle.apply({ id: 'next-round-likes', type: 'like', viewer, count: 50 });
  expect(battle.state.fighters[0].likePower).toBe(2);
  battle.apply(gift('reinforce'));
  expect(battle.state.fighters.filter((f) => f.temporary).every((f) => !f.likePower)).toBe(true);
});

test('likes beyond the highest personal tier still trigger repeatable team heals', () => {
  const battle = joined();
  const [red, blue] = battle.state.fighters;
  battle.apply({ id: 'max', type: 'like', viewer, count: 2300 });
  expect(red).toMatchObject({ likeTier: 8, likePower: 7, hp: 120, maxHp: 120 });
  expect(battle.state.rallyLikes).toEqual({ red: 100, blue: 0 });
  battle.apply({ id: 'ally', type: 'join', viewer: { id: 'ally', name: 'Ally' }, team: 'red' });
  const ally = battle.state.fighters[2];
  Object.assign(ally, { hp: 0, respawn: 3 });
  red.hp = 60;
  blue.hp = 35;

  battle.apply({ id: 'overflow', type: 'like', viewer, count: 100 });
  expect(red).toMatchObject({ likeTier: 8, hp: 70 });
  expect(blue.hp).toBe(35);
  expect(ally.hp).toBe(0);
  expect(battle.state.effects.at(-1)).toMatchObject({ type: 'rally', team: 'red' });
  expect(battle.state.rallyLikes).toEqual({ red: 0, blue: 0 });

  Object.assign(red, { x: 185, y: 320, cooldown: 0, kills: 2 });
  Object.assign(blue, { x: 298, y: 320, cooldown: 5, hp: 1 });
  battle.update(0.05);
  expect(blue.hp).toBe(0);
  expect(red).toMatchObject({ level: 2, maxHp: 140 });
  expect(red.cooldown).toBeCloseTo(0.52 * 0.86, 5);
});

test('an arrival is addressed on screen until they have chosen a team', () => {
  const battle = new Battle();
  const guest = { id: 'guest', name: 'Guest', handle: 'guest_1' };
  battle.apply({ id: 'arrive', type: 'viewerJoined', viewer: guest });
  expect(battle.state.activity[0]).toMatchObject({ name: '@guest_1', kind: 'welcome' });
  battle.apply({ id: 'join', type: 'chat', viewer: guest, message: 'אדום' });
  expect(battle.state.fighters[0].team).toBe('red');
  battle.apply({ id: 'return', type: 'viewerJoined', viewer: guest });
  expect(battle.state.activity.filter((item) => item.kind === 'welcome')).toHaveLength(1);
});
