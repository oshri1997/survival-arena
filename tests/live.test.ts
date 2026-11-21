import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Battle } from '../src/teams/Battle';
import { MAX_ACTIVE_VIEWERS, type AudienceEvent } from '../src/teams/contracts';
import { Store } from '../server/store';
import { DatabaseSync } from 'node:sqlite';
import { liveEventSchema, type LiveEvent } from '../server/live/contracts';
import { normalizeEuler } from '../server/live/euler';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close();
});
const viewer = { id: '9007199254740993999', name: 'Luna' };
const binding = { roomId: '9007199254740993998', creatorId: '9007199254740993997' };
const liveGift = (
  overrides: Partial<Extract<LiveEvent, { type: 'gift' }>> = {},
): Extract<LiveEvent, { type: 'gift' }> => ({
  id: 'gift-message-1',
  type: 'gift',
  viewer,
  roomId: binding.roomId,
  recipientId: binding.creatorId,
  giftId: 'real-id-from-catalog',
  giftName: 'Test flower',
  count: 1,
  streak: true,
  streakEnd: false,
  seriesId: 'group-1',
  ...overrides,
});
function setup(path = ':memory:') {
  const store = new Store(path);
  cleanups.push(() => store.close());
  const battle = new Battle(() => 0.5, store.restore());
  const joinViewer = (id = viewer.id, team: 'red' | 'blue' = 'red') =>
    store.ingest(battle, {
      id: `join:${id}:${team}`,
      type: 'join',
      viewer: { id, name: id === viewer.id ? 'Luna' : 'Other' },
      team,
    });
  const gift = (extra: Partial<Extract<AudienceEvent, { type: 'gift' }>> = {}) =>
    store.ingest(battle, {
      id: 'internal-gift',
      type: 'gift',
      viewer,
      gift: 'reinforce',
      amount: 1,
      ...extra,
    });
  return { store, battle, joinViewer, gift };
}

describe('durable gift lifecycle and roster', () => {
  test('a gift before team choice survives DB reopen, binds once and is never replayed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gift-inbox-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'state.sqlite');
    const first = setup(path);
    expect(first.gift()).toMatchObject({ accepted: true, status: 'queued' });
    expect(first.store.diagnostics().pending).toBe(1);
    first.store.close();
    cleanups.pop();
    const second = setup(path);
    expect(second.gift()).toMatchObject({ duplicate: true, status: 'queued' });
    second.joinViewer();
    expect(second.battle.state.fighters).toHaveLength(4);
    expect(second.gift()).toMatchObject({
      duplicate: true,
      status: 'applied',
      details: { spawned: 3 },
    });
    expect(second.store.diagnostics().pending).toBe(0);
    second.joinViewer(viewer.id, 'blue');
    expect(second.battle.state.fighters).toHaveLength(1);
    expect(second.gift()).toMatchObject({ duplicate: true });
    expect(second.battle.state.fighters).toHaveLength(1);
  });
  test('paused/result gifts wait, keep the original team through a switch, and flush on automatic restart', () => {
    const { store, battle, joinViewer, gift } = setup();
    joinViewer();
    battle.state.phase = 'result';
    battle.state.remaining = 0.01;
    expect(gift({ gift: 'shield' })).toMatchObject({ status: 'queued' });
    // Registration works even during results, without redirecting the already-bound gift.
    expect(joinViewer(viewer.id, 'blue')).toMatchObject({ accepted: true, status: 'queued' });
    battle.state.paused = true;
    store.tick(battle, 0.05);
    expect(store.diagnostics().pending).toBe(1);
    battle.state.paused = false;
    store.tick(battle, 0.05);
    expect(battle.state.round).toBe(2);
    expect(battle.state.shields).toEqual({ red: 6, blue: 0 });
    expect(gift({ gift: 'shield' })).toMatchObject({ duplicate: true, status: 'applied' });
  });
  test('large counts and full ally capacity report the actual effect, never pretend all allies spawned', () => {
    const { battle, joinViewer, gift } = setup();
    joinViewer();
    expect(gift({ amount: 1_000_000 })).toMatchObject({
      status: 'applied',
      details: { requested: 1_000_000, spawned: 99 },
    });
    expect(gift({ id: 'overflow' })).toMatchObject({
      accepted: true,
      status: 'cosmetic',
      details: { spawned: 0 },
    });
    expect(battle.state.fighters).toHaveLength(100);
    expect(gift({ id: 'huge-shield', gift: 'shield', amount: 1_000_000 })).toMatchObject({
      details: { secondsAdded: 18 },
    });
    expect(gift({ id: 'capped-shield', gift: 'shield' })).toMatchObject({
      status: 'cosmetic',
      details: { secondsAdded: 0 },
    });
  });
  test('over 100 registered viewers rotate fairly; waiting viewers count towards the current team goal', () => {
    const { store, battle, joinViewer } = setup();
    for (let i = 0; i < 125; i++)
      expect(joinViewer(`v${i}`, i % 2 ? 'blue' : 'red').accepted).toBe(true);
    expect(battle.state.fighters).toHaveLength(MAX_ACTIVE_VIEWERS);
    expect(battle.state.fighters.some((f) => f.ownerId === 'v124')).toBe(false);
    expect(
      store.ingest(battle, {
        id: 'waiting-like',
        type: 'like',
        viewer: { id: 'v124', name: 'Waiting' },
        count: 101,
      }),
    ).toMatchObject({ accepted: true });
    expect(battle.state.fighters.every((f) => !f.likePower)).toBe(true);
    expect(battle.state.rallyLikes?.red).toBe(101);
    const first = new Set(battle.state.fighters.map((f) => f.ownerId));
    store.restart(battle);
    expect(battle.state.fighters.find((f) => f.ownerId === 'v124')).toBeDefined();
    expect(battle.state.fighters.find((f) => f.ownerId === 'v124')?.likePower).toBeUndefined();
    const played = new Set([...first, ...battle.state.fighters.map((f) => f.ownerId)]);
    expect(played.size).toBe(125);
    expect(store.diagnostics().roster.reduce((sum, row) => sum + Number(row.count), 0)).toBe(125);
  });
  test('profile updates do not turn retries into a second gift and conflicting payloads do not consume new gifts', () => {
    const { gift, joinViewer, battle } = setup();
    joinViewer();
    gift();
    expect(
      gift({ viewer: { ...viewer, name: 'Renamed', avatar: 'https://example.com/avatar.png' } }),
    ).toMatchObject({ duplicate: true, accepted: true });
    expect(gift({ amount: 2 })).toMatchObject({ duplicate: true, accepted: false });
    expect(battle.state.fighters).toHaveLength(4);
  });
});

describe('upstream gift normalization', () => {
  test('streak 1 → 3 → stale 2 → duplicate final 3 → late final 5 contributes exactly five', () => {
    const { store, battle, joinViewer } = setup();
    joinViewer();
    store.mapGift('real-id-from-catalog', 'reinforce');
    for (const count of [1, 3, 2, 3, 5, 5])
      store.ingestLive(
        battle,
        liveGift({ id: `message:${count}`, count, streakEnd: count >= 3 }),
        binding,
      );
    expect(battle.state.fighters).toHaveLength(16);
    expect(
      store
        .diagnostics()
        .gifts.reduce((sum, receipt) => sum + (receipt.result.details?.requested ?? 0), 0),
    ).toBe(5);
    expect(store.ingestLive(battle, liveGift({ count: 5 }), binding)).toMatchObject({
      duplicate: true,
    });
    expect(battle.state.fighters).toHaveLength(16);
  });
  test('the streak high watermark survives DB reopen without repeating a delivered or pending unit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gift-streak-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'state.sqlite');
    const first = setup(path);
    first.store.mapGift('real-id-from-catalog', 'reinforce');
    first.store.ingestLive(first.battle, liveGift({ count: 7 }), binding);
    first.store.close();
    cleanups.pop();
    const next = setup(path);
    next.joinViewer();
    expect(
      next.store.ingestLive(next.battle, liveGift({ count: 7, streakEnd: true }), binding),
    ).toMatchObject({ duplicate: true });
    expect(next.battle.state.fighters).toHaveLength(22);
    next.store.ingestLive(next.battle, liveGift({ count: 8 }), binding);
    expect(next.battle.state.fighters).toHaveLength(25);
  });
  test('distinct streaks, viewers, recipients and rooms cannot share one counter', () => {
    const { store, battle, joinViewer } = setup();
    joinViewer();
    store.mapGift('real-id-from-catalog', 'reinforce');
    store.ingestLive(battle, liveGift({ count: 2 }), binding);
    store.ingestLive(battle, liveGift({ count: 2, seriesId: 'group-2' }), binding);
    store.ingestLive(battle, liveGift({ count: 9, recipientId: 'guest' }), binding);
    store.ingestLive(battle, liveGift({ count: 9, roomId: 'foreign' }), binding);
    expect(battle.state.fighters).toHaveLength(13);
    store.ingestLive(battle, liveGift({ count: 2, roomId: 'new-room' }), {
      ...binding,
      roomId: 'new-room',
    });
    expect(battle.state.fighters).toHaveLength(19);
    const other = { id: 'other', name: 'Other' };
    joinViewer(other.id);
    store.ingestLive(battle, liveGift({ count: 2, viewer: other }), binding);
    expect(battle.state.fighters).toHaveLength(26);
  });
  test('no stable series ID: only the final message applies and its repeated ID is idempotent', () => {
    const { store, battle, joinViewer } = setup();
    joinViewer();
    store.mapGift('real-id-from-catalog', 'reinforce');
    const event = liveGift({ seriesId: undefined, count: 3 });
    store.ingestLive(battle, event, binding);
    expect(battle.state.fighters).toHaveLength(1);
    store.ingestLive(battle, { ...event, streakEnd: true }, binding);
    store.ingestLive(battle, { ...event, streakEnd: true }, binding);
    expect(battle.state.fighters).toHaveLength(10);
  });
  test('non-streak gifts deduplicate by message, not by gift name; unmapped IDs get a neutral thank you', () => {
    const { store, battle } = setup();
    const unknown = liveGift({ streak: false, streakEnd: true, count: 21 });
    expect(store.ingestLive(battle, unknown, binding)).toMatchObject({
      accepted: true,
      status: 'cosmetic',
      details: { requested: 21 },
    });
    expect(store.diagnostics().pending).toBe(0);
    expect(battle.state.fighters).toHaveLength(0);
    expect(battle.state.activity[0].text).toContain('thank you ×21');
    store.mapGift(unknown.giftId, 'reinforce');
    // Mapping changes affect only future events; a retry must not reinterpret an old gift.
    expect(store.ingestLive(battle, unknown, binding)).toMatchObject({
      duplicate: true,
      status: 'cosmetic',
    });
    expect(store.ingestLive(battle, { ...unknown, id: 'new-message' }, binding)).toMatchObject({
      status: 'queued',
    });
    expect(store.diagnostics().pending).toBe(1);
  });
  test.each([0, -1, 1.5, 1_000_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid raw gift count %s before recording it',
    (count) => {
      const { store, battle } = setup();
      expect(() => store.ingestLive(battle, liveGift({ count }), binding)).toThrow();
      expect(store.diagnostics().gifts).toHaveLength(0);
    },
  );
  test('rejects imprecise numeric IDs and oversized raw like counters', () => {
    expect(liveEventSchema.safeParse({ ...liveGift(), giftId: 9007199254740993 }).success).toBe(
      false,
    );
    expect(
      liveEventSchema.safeParse({
        type: 'like',
        id: 'like',
        viewer,
        roomId: binding.roomId,
        count: 1_000_001,
      }).success,
    ).toBe(false);
  });
});

describe('Euler v3 boundary', () => {
  const common = { msgId: '9223372036854775800', roomId: binding.roomId };
  const user = { id: viewer.id, nickname: 'Luna' };
  test('preserves string IDs, gift recipient and group; likes use delta count rather than total', () => {
    expect(
      normalizeEuler('WebcastGiftMessage', {
        common,
        user,
        toUser: { id: binding.creatorId },
        giftId: '5655',
        repeatCount: 1000,
        repeatEnd: 0,
        groupId: 'combo-1',
        gift: { name: 'Rose', type: 1 },
      }),
    ).toMatchObject({
      id: common.msgId,
      type: 'gift',
      recipientId: binding.creatorId,
      count: 1000,
      seriesId: 'combo-1',
      streak: true,
      streakEnd: false,
    });
    expect(
      normalizeEuler('WebcastLikeMessage', { common, user, count: 3, total: '99999999999' }),
    ).toMatchObject({ type: 'like', count: 3 });
    expect(normalizeEuler('WebcastChatMessage', { common, user, content: 'red' })).toMatchObject({
      type: 'chat',
      message: 'red',
    });
    expect(normalizeEuler('WebcastMemberMessage', { common, user })).toMatchObject({
      type: 'viewerJoined',
    });
    expect(normalizeEuler('WebcastSocialMessage', { common, user, action: '1' })).toMatchObject({
      type: 'follow',
    });
  });
  test('ignores shares, gift broadcasts, envelopes, goals and unsupported message classes', () => {
    expect(normalizeEuler('WebcastSocialMessage', { common, user, action: '3' })).toBeUndefined();
    for (const type of [
      'WebcastGiftBroadcastMessage',
      'WebcastEnvelopeMessage',
      'WebcastGoalUpdateMessage',
      'WebcastUnknownMessage',
    ])
      expect(normalizeEuler(type, {})).toBeUndefined();
  });
  test('does not invent a recipient, gift type, group, user or message ID', () => {
    expect(() =>
      normalizeEuler('WebcastGiftMessage', { common, user, giftId: '1', repeatCount: 1 }),
    ).toThrow();
    expect(() =>
      normalizeEuler('WebcastLikeMessage', {
        common: { ...common, msgId: 9007199254740993 },
        user,
        count: 3,
      }),
    ).toThrow();
  });
});

test('a failed DB transaction rolls back streak watermark, receipt and gameplay together', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gift-rollback-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.sqlite');
  const { store, battle, joinViewer } = setup(path);
  joinViewer();
  store.mapGift('real-id-from-catalog', 'reinforce');
  const db = new DatabaseSync(path);
  cleanups.push(() => db.close());
  db.exec(
    "CREATE TRIGGER fail_gifts BEFORE INSERT ON gifts BEGIN SELECT RAISE(ABORT,'test storage failure'); END",
  );
  expect(() => store.ingestLive(battle, liveGift({ count: 3 }), binding)).toThrow(
    'test storage failure',
  );
  expect(battle.state.fighters).toHaveLength(1);
  expect(store.diagnostics().gifts).toHaveLength(0);
  db.exec('DROP TRIGGER fail_gifts');
  expect(store.ingestLive(battle, liveGift({ count: 3 }), binding)).toMatchObject({
    duplicate: false,
    status: 'applied',
  });
  expect(battle.state.fighters).toHaveLength(10);
});

test('gift receipts remain idempotent beyond the former 20,000-event pruning horizon', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gift-retention-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.sqlite');
  const { battle, joinViewer, gift } = setup(path);
  joinViewer();
  gift();
  const db = new DatabaseSync(path);
  try {
    db.exec('BEGIN');
    const insert = db.prepare('INSERT INTO events(id,result,created) VALUES (?, ?, ?)');
    for (let i = 0; i < 20001; i++) insert.run(`history:${i}`, '{"accepted":true}', Date.now() + i);
    db.exec('COMMIT');
  } finally {
    db.close();
  }
  gift({ id: 'latest', gift: 'boost' });
  expect(gift()).toMatchObject({ accepted: true, duplicate: true });
  expect(battle.state.fighters).toHaveLength(4);
});

test('optional profile metadata cannot discard an otherwise valid gift', () => {
  const gift = normalizeEuler('WebcastGiftMessage', {
    common: { msgId: 'metadata-gift', roomId: binding.roomId },
    user: {
      id: viewer.id,
      nickname: null,
      avatarThumb: { urlList: ['https://user:pass@example.com/avatar', 'javascript:alert(1)'] },
    },
    toUser: { id: binding.creatorId },
    giftId: 'flower',
    repeatCount: 1,
    repeatEnd: 1,
    groupId: '0',
    gift: { name: '  ', type: 2 },
  });
  expect(gift).toMatchObject({
    type: 'gift',
    giftName: 'Gift flower',
    viewer: { id: viewer.id, name: 'Viewer' },
    streak: false,
  });
  expect(gift?.viewer.avatar).toBeUndefined();
  const { store, battle } = setup();
  expect(store.ingestLive(battle, gift!, binding)).toMatchObject({
    accepted: true,
    status: 'cosmetic',
  });
  expect(
    store.ingestLive(
      battle,
      { type: 'chat', id: 'ordinary-chat', roomId: binding.roomId, viewer, message: 'Nice game!' },
      binding,
    ),
  ).toMatchObject({ accepted: true, status: 'cosmetic' });
  expect(battle.state.fighters).toHaveLength(0);
});

test('a queued receipt updates its waiting reason when the sender chooses a team during pause', () => {
  const { battle, store, gift, joinViewer } = setup();
  battle.state.paused = true;
  expect(gift()).toMatchObject({
    status: 'queued',
    reason: 'Waiting for the viewer to choose red or blue',
  });
  joinViewer();
  expect(gift()).toMatchObject({
    duplicate: true,
    status: 'queued',
    reason: 'Waiting for an unpaused battle',
  });
  expect(store.diagnostics().gifts[0].result.reason).toBe('Waiting for an unpaused battle');
  battle.state.paused = false;
  store.tick(battle, 0.05);
  expect(gift()).toMatchObject({ duplicate: true, status: 'applied', details: { spawned: 3 } });
  expect(battle.state.fighters).toHaveLength(4);
});
