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
    battle.apply({ id: 'likes', type: 'like', viewer, count: 40 });
    expect(battle.state.likeBoosts?.red).toBe(8);
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

test('like power survives the wait and doubles the first hit, then wears off in combat', () => {
  const battle = joined();
  const [red, blue] = battle.state.fighters;
  // Keep blue out of play long enough that the old four-second timer would have expired.
  blue.hp = 0;
  blue.respawn = 30;
  battle.apply({ id: 'early-likes', type: 'like', viewer, count: 20 });
  advance(battle, 9);
  expect(battle.state.likeBoosts?.red).toBe(4);
  expect(battle.state.boosts.red).toBe(0);

  Object.assign(red, { x: 185, y: 320, cooldown: 0, maxHp: 1000, hp: 1000 });
  Object.assign(blue, { x: 298, y: 320, cooldown: 0, maxHp: 1000, hp: 1000 });
  battle.update(0.05);
  expect(red.hp).toBe(988);
  expect(blue.hp).toBe(976);
  expect(battle.state.effects).toContainEqual(
    expect.objectContaining({ type: 'shot', team: 'red', powered: true }),
  );
  expect(battle.state.likeBoosts?.red).toBeLessThan(4);
  advance(battle, 6);
  expect(battle.state.likeBoosts?.red).toBe(0);
});
