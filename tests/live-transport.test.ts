import { afterEach, expect, test, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { EulerConnector, type ConnectorStatus } from '../server/live/euler';
import { createBattleServer } from '../server/app';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function setup() {
  const app = createBattleServer({
    adminKey: 'admin',
    eventKey: 'events',
    statePath: ':memory:',
    distPath: resolve('dist'),
    seedDemo: false,
    demoJoin: false,
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
    creatorId: 'host',
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
function event(type: string, id: string, extra: Record<string, unknown> = {}) {
  return {
    type,
    data: {
      common: { msgId: id, roomId: 'room-1' },
      user: { id: 'viewer-1', nickname: 'Viewer' },
      ...extra,
    },
  };
}

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
  expect(app.battle.state.boosts.red).toBeGreaterThan(14);
  expect(app.battle.state.likes.red).toBe(1);
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
