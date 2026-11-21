import { afterEach, expect, test, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EulerConnector, type ConnectorStatus } from '../server/live/euler';
import { createBattleServer } from '../server/app';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function setup(options: { creatorId?: string } = { creatorId: 'host' }) {
  const app = createBattleServer({
    adminKey: 'admin',
    eventKey: 'events',
    statePath: ':memory:',
    distPath: resolve('dist'),
    seedDemo: false,
    demoJoin: false,
    liveCollector: true,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  cleanup.push(app.close);
  const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api/teams/`;
  const post = (path: string, input: unknown, headers: Record<string, string> = {}) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(input),
    });
  const provider = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(provider, 'listening');
  cleanup.push(() => {
    for (const client of provider.clients) client.terminate();
    return new Promise<void>((resolve) => provider.close(() => resolve()));
  });
  const endpoint = `ws://127.0.0.1:${(provider.address() as { port: number }).port}`;
  const statuses: ConnectorStatus[] = [];
  const connector = new EulerConnector({
    username: '@test-only',
    apiKey: 'server-only-test-key',
    creatorId: options.creatorId,
    endpoint,
    retryMs: 20,
    accept: app.live.accept,
    bind: app.live.bind,
    status: (status) => {
      statuses.push(status);
      app.live.status({ ...status });
    },
  });
  cleanup.push(() => connector.stop());
  return { app, provider, connector, post, url, statuses };
}
function event(type: string, id: string, extra: Record<string, unknown> = {}, roomId = 'room-1') {
  return {
    type,
    data: {
      common: { msgId: id, roomId },
      user: { id: 'viewer-1', nickname: 'Viewer' },
      ...extra,
    },
  };
}

test('waiting freezes the arena, a reconnect preserves it, and confirmed LIVE end resets it', async () => {
  const { app, provider, connector, post, url, statuses } = await setup();
  const state = async () => (await fetch(url + 'state')).json();
  const send = (socket: WebSocket, ...messages: unknown[]) =>
    socket.send(JSON.stringify({ messages }));
  const connect = (roomId: string) => ({
    type: 'room.status',
    data: { state: 'connected', roomId },
  });
  const chat = event('WebcastChatMessage', 'chat', { content: 'red' });
  const likes = event('WebcastLikeMessage', 'likes', { count: 149, total: '9999' });
  expect(await state()).toMatchObject({ live: 'waiting', round: 1, remaining: 120, fighters: [] });

  let connection = once(provider, 'connection');
  connector.start();
  let [socket] = (await connection) as [WebSocket];
  send(socket, connect('room-1'), chat, likes, likes);
  await vi.waitFor(() => expect(app.battle.state.fighters[0]?.likePower).toBe(2));
  expect(app.battle.state.viewerLikes?.['viewer:viewer-1']).toBe(149);
  expect(await state()).not.toHaveProperty('viewerLikes');
  expect(await state()).not.toHaveProperty('liveRoomId');

  connection = once(provider, 'connection');
  socket.close(1011);
  [socket] = (await connection) as [WebSocket];
  send(socket, connect('room-1'), event('WebcastLikeMessage', 'one-more', { count: 1 }));
  await vi.waitFor(() => expect(app.battle.state.fighters[0]?.likePower).toBe(4));
  expect(await state()).toMatchObject({ live: 'live', fighters: [{ likePower: 4 }] });
  expect((await state()).remaining).toBeLessThan(120);

  app.store.mapGift('flower', 'reinforce');
  const queued = {
    id: 'queued',
    type: 'gift',
    roomId: 'room-1',
    recipientId: 'host',
    viewer: { id: 'other', name: 'Other' },
    giftId: 'flower',
    giftName: 'Flower',
    count: 1,
    streak: false,
    streakEnd: true,
  };
  expect(
    await (await post('live/events', queued, { Authorization: 'Bearer events' })).json(),
  ).toMatchObject({ status: 'queued' });
  send(socket, { type: 'tiktok.disconnect', data: { reason: 4005 } }, chat, likes);
  await vi.waitFor(() => expect(statuses.at(-1)).toMatchObject({ state: 'ended' }));
  expect(await state()).toMatchObject({
    live: 'waiting',
    round: 1,
    remaining: 120,
    territory: 0.5,
    effects: [],
    activity: [],
    fighters: [],
  });
  expect(app.store.diagnostics()).toMatchObject({
    roster: [],
    pending: 0,
    gifts: [{ status: 'cosmetic' }],
    catalog: [{ id: 'flower', action: 'reinforce' }],
  });
  expect((await post('live/events', queued, { Authorization: 'Bearer events' })).status).toBe(503);

  send(
    socket,
    connect('room-2'),
    event('WebcastChatMessage', 'chat', { content: 'blue' }, 'room-2'),
  );
  await vi.waitFor(async () =>
    expect(await state()).toMatchObject({ live: 'live', round: 1, fighters: [{ team: 'blue' }] }),
  );
  expect(app.battle.state.fighters[0].likePower).toBeUndefined();
  const closed = once(socket, 'close');
  socket.close(4404);
  await closed;
  await vi.waitFor(async () =>
    expect(await state()).toMatchObject({ live: 'waiting', remaining: 120, fighters: [] }),
  );
});

test('a server restart restores personal power only when the provider confirms the same room', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-live-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const start = async () => {
    const app = createBattleServer({
      adminKey: 'admin',
      eventKey: 'events',
      statePath: join(directory, 'arena.sqlite'),
      distPath: resolve('dist'),
      liveCollector: true,
    });
    cleanup.push(app.close);
    await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
    const port = (app.server.address() as { port: number }).port;
    return {
      app,
      state: async () => (await fetch(`http://127.0.0.1:${port}/api/teams/state`)).json(),
    };
  };
  const room = { roomId: 'room-1' };
  const viewer = { id: 'first', name: 'First' };
  const original = await start();
  original.app.live.bind(room);
  original.app.live.accept({ ...room, id: 'chat', type: 'chat', viewer, message: 'red' });
  original.app.live.accept({ ...room, id: 'likes', type: 'like', viewer, count: 150 });
  await original.app.close();

  const restored = await start();
  expect(await restored.state()).toMatchObject({ live: 'waiting', fighters: [] });
  restored.app.live.bind(room);
  expect(await restored.state()).toMatchObject({ live: 'live', fighters: [{ likePower: 4 }] });
  restored.app.live.bind({ roomId: 'room-2' });
  expect(await restored.state()).toMatchObject({ live: 'live', round: 1, fighters: [] });
  expect(restored.app.store.diagnostics().roster).toEqual([]);
});

test('real socket → normalization → SQLite → authoritative HTTP/WS state; mapping and diagnostics require admin', async () => {
  const { app, provider, connector, post, url } = await setup();
  expect((await post('live/events', {}, { Authorization: 'Bearer events' })).status).toBe(503);
  expect((await fetch(url + 'admin/diagnostics')).status).toBe(401);
  expect((await post('admin/gift-mapping', { giftId: 'flower', action: 'reinforce' })).status).toBe(
    401,
  );
  const login = await post('admin/login', { key: 'admin' });
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  expect(
    (
      await post(
        'admin/gift-mapping',
        { giftId: 'flower', action: 'reinforce' },
        { Cookie: cookie },
      )
    ).status,
  ).toBe(200);
  const connection = once(provider, 'connection');
  connector.start();
  const [socket] = (await connection) as [WebSocket];
  socket.send(
    JSON.stringify({
      messages: [
        { type: 'room.status', data: { state: 'connected', roomId: 'room-1' } },
        event('WebcastMemberMessage', 'join'),
        event('WebcastChatMessage', 'chat', { content: 'red' }),
        event('WebcastGiftMessage', 'gift', {
          giftId: 'flower',
          repeatCount: 2,
          repeatEnd: 0,
          groupId: 'series',
          toUser: { id: 'host' },
          gift: { name: 'Flower', type: 1 },
        }),
        event('WebcastGiftMessage', 'gift-final', {
          giftId: 'flower',
          repeatCount: 2,
          repeatEnd: 1,
          groupId: 'series',
          toUser: { id: 'host' },
          gift: { name: 'Flower', type: 1 },
        }),
        event('WebcastLikeMessage', 'likes', { count: 101, total: '100001' }),
        event('WebcastSocialMessage', 'follow', { action: '1' }),
        // A malformed class does not prevent processing the remaining bundle.
        event('WebcastGiftMessage', 'bad-gift'),
        event('WebcastGiftBroadcastMessage', 'broadcast'),
      ],
    }),
  );
  await vi.waitFor(() => expect(app.battle.state.fighters).toHaveLength(7));
  expect(app.battle.state.fighters[0].likePower).toBe(2);
  expect(app.battle.state.fighters.slice(1).every((f) => !f.likePower)).toBe(true);
  const diagnostics = await (
    await fetch(url + 'admin/diagnostics', { headers: { Cookie: cookie } })
  ).json();
  expect(diagnostics).toMatchObject({
    pending: 0,
    live: { state: 'connected', invalid: 1, ignored: 1 },
    catalog: [{ id: 'flower', action: 'reinforce' }],
  });
  expect(JSON.stringify(diagnostics)).not.toContain('server-only-test-key');
  const raw = {
    id: 'foreign',
    type: 'gift',
    roomId: 'room-1',
    recipientId: 'guest',
    viewer: { id: 'other', name: 'Other' },
    giftId: 'flower',
    giftName: 'Flower',
    count: 100,
    streak: false,
    streakEnd: true,
  };
  expect((await post('live/events', raw)).status).toBe(401);
  expect(
    await (await post('live/events', raw, { Authorization: 'Bearer events' })).json(),
  ).toMatchObject({ accepted: true, reason: expect.stringContaining('Filtered') });
  expect(app.battle.state.fighters).toHaveLength(7);
  // Catalog labels are data, not HTML.
  const unknown = {
    ...raw,
    id: 'unknown',
    recipientId: 'host',
    giftId: 'unmapped',
    giftName: '<img src=x onerror=alert(1)>',
  };
  expect(
    await (await post('live/events', unknown, { Authorization: 'Bearer events' })).json(),
  ).toMatchObject({ accepted: true, status: 'cosmetic' });
  expect(app.store.diagnostics().pending).toBe(0);
});

test('LIVE chat and likes work without a creator ID while gifts wait for a verified recipient', async () => {
  const { app, provider, connector, post, statuses } = await setup({});
  app.store.mapGift('flower', 'reinforce');
  const connection = once(provider, 'connection');
  connector.start();
  const [socket] = (await connection) as [WebSocket];
  socket.send(
    JSON.stringify({
      messages: [
        { type: 'room.status', data: { state: 'connected', roomId: 'room-1' } },
        event('WebcastChatMessage', 'chat-without-creator', { content: 'red' }),
        event('WebcastLikeMessage', 'like-without-creator', { count: 5, total: '5' }),
        event('WebcastGiftMessage', 'gift-without-creator', {
          giftId: 'flower',
          repeatCount: 1,
          repeatEnd: 1,
          toUser: { id: 'unverified-recipient' },
          gift: { name: 'Flower', type: 2 },
        }),
      ],
    }),
  );
  await vi.waitFor(() =>
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', giftsEnabled: false, ignored: 1 }),
  );
  expect(app.battle.state.fighters).toHaveLength(1);
  expect(app.battle.state.fighters[0].team).toBe('red');
  expect(app.battle.state.viewerLikes?.['viewer:viewer-1']).toBe(5);

  const result = await post(
    'live/events',
    {
      id: 'http-gift-without-creator',
      type: 'gift',
      roomId: 'room-1',
      recipientId: 'unverified-recipient',
      viewer: { id: 'viewer-1', name: 'Viewer' },
      giftId: 'flower',
      giftName: 'Flower',
      count: 1,
      streak: false,
      streakEnd: true,
    },
    { Authorization: 'Bearer events' },
  );
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({
    accepted: false,
    reason: expect.stringContaining('TIKTOK_CREATOR_ID'),
  });
  expect(app.store.diagnostics().gifts).toHaveLength(0);
  expect(app.battle.state.fighters).toHaveLength(1);
});

test('offline closes retry independently of viewers; invalid auth stops retrying and reports a safe status', async () => {
  const { provider, connector, statuses } = await setup();
  let count = 0;
  provider.on('connection', (socket) => {
    count++;
    socket.close(count === 1 ? 4404 : 4401, 'secret must not be surfaced');
  });
  connector.start();
  await vi.waitFor(() => expect(statuses.some((status) => status.state === 'offline')).toBe(true));
  await vi.waitFor(() => expect(statuses.at(-1)?.lastCloseCode).toBe(4401));
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(count).toBe(2);
  expect(JSON.stringify(statuses)).not.toContain('secret must not be surfaced');
  expect(statuses.at(-1)?.reason).toContain('credentials');
  connector.stop();
  expect(statuses.at(-1)?.state).toBe('stopped');
});

test('temporary HTTP processing failures return retryable 503 without leaking errors or consuming a gift', async () => {
  const { app, post } = await setup();
  app.live.bind({ roomId: 'room-1', creatorId: 'host' });
  const raw = {
    id: 'retry-me',
    type: 'gift',
    roomId: 'room-1',
    recipientId: 'host',
    viewer: { id: 'sender', name: 'Sender' },
    giftId: 'unmapped',
    giftName: 'Seasonal',
    count: 1,
    streak: false,
    streakEnd: true,
  };
  vi.spyOn(app.store, 'ingestLive').mockImplementationOnce(() => {
    throw new Error('private storage connection detail');
  });
  const failed = await post('live/events', raw, { Authorization: 'Bearer events' });
  expect(failed.status).toBe(503);
  const message = await failed.text();
  expect(message).toContain('retry the same event ID');
  expect(message).not.toContain('private storage');
  expect(app.store.diagnostics().gifts).toHaveLength(0);
  expect(
    await (await post('live/events', raw, { Authorization: 'Bearer events' })).json(),
  ).toMatchObject({ accepted: true, duplicate: false, status: 'cosmetic' });
  expect(
    await (await post('live/events', raw, { Authorization: 'Bearer events' })).json(),
  ).toMatchObject({ accepted: true, duplicate: true, status: 'cosmetic' });
  expect(app.store.diagnostics().gifts).toHaveLength(1);
});
