import { afterEach, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createBattleServer } from '../server/app';
import { Battle } from '../src/teams/Battle';
import { Store } from '../server/store';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function setup(demoJoin = false) {
  const app = createBattleServer({
    adminKey: 'test-admin',
    eventKey: 'test-events',
    statePath: ':memory:',
    distPath: resolve('dist'),
    seedDemo: false,
    demoJoin,
  });
  await new Promise<void>((resolveReady) => app.server.listen(0, '127.0.0.1', resolveReady));
  cleanups.push(app.close);
  const address = app.server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const post = (path: string, data: unknown, headers: Record<string, string> = {}) =>
    fetch(`${url}/api/teams/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  return { app, url, post };
}
const viewer = { id: 'real-viewer-id', name: 'Kai' };

test('event ingestion validates authorization and payloads; admin cookies survive refresh and logout revokes them', async () => {
  const { post, url } = await setup();
  expect((await post('events', {})).status).toBe(401);
  expect(
    (await post('events', { type: 'gift' }, { Authorization: 'Bearer test-events' })).status,
  ).toBe(400);
  expect((await post('admin/actions', { type: 'pause', paused: true })).status).toBe(401);
  expect((await post('join', { team: 'red' })).status).toBe(403);
  expect(
    (await post('admin/login', { key: 'test-admin' }, { Origin: 'https://untrusted.example' }))
      .status,
  ).toBe(403);
  expect((await post('admin/login', { key: 'wrong' })).status).toBe(401);
  const response = await post('admin/login', { key: 'test-admin' });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  const headers = { Cookie: cookie };
  expect(await (await fetch(`${url}/api/teams/admin/session`, { headers })).json()).toEqual({
    authenticated: true,
  });
  expect((await post('admin/actions', { type: 'pause', paused: true }, headers)).status).toBe(200);
  expect(await (await fetch(`${url}/api/teams/state`)).json()).toMatchObject({ paused: true });
  await post('admin/logout', {}, headers);
  expect((await post('admin/actions', { type: 'restart' }, headers)).status).toBe(401);
});

test('two read-only WebSocket viewers receive the same authoritative state and authenticated gifts apply once', async () => {
  const { post, url, app } = await setup();
  const headers = { Authorization: 'Bearer test-events' };
  const joinResponse = await post(
    'events',
    { id: 'join-1', type: 'chat', viewer, message: 'red' },
    headers,
  );
  expect(joinResponse.status).toBe(200);
  const gift = { id: 'provider-gift-unique', type: 'gift', viewer, gift: 'reinforce', amount: 1 };
  expect(await (await post('events', gift, headers)).json()).toMatchObject({
    accepted: true,
    duplicate: false,
  });
  expect(await (await post('events', gift, headers)).json()).toMatchObject({
    accepted: true,
    duplicate: true,
  });
  expect(app.battle.state.fighters).toHaveLength(4);
  app.battle.state.paused = true;
  const read = async () => {
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/api/teams/socket');
    const [data] = await once(ws, 'message');
    const snapshot = JSON.parse(String(data));
    ws.close();
    return snapshot;
  };
  const [a, b] = await Promise.all([read(), read()]);
  expect(a.state).toEqual(b.state);
  expect(a.state.fighters).toHaveLength(4);
  const ws = new WebSocket(url.replace('http:', 'ws:') + '/api/teams/socket');
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'restart' }));
  const [code] = await once(ws, 'close');
  expect(code).toBe(1008);
});

test('durable event receipt and game state survive process storage reopen without repeating gifts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'team-store-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'battle.sqlite');
  const event = {
    id: 'gift-after-reconnect',
    type: 'gift' as const,
    viewer,
    gift: 'reinforce' as const,
    team: 'red' as const,
    amount: 1,
  };
  let store = new Store(path);
  let battle = new Battle(() => 0.5);
  store.ingest(battle, event);
  store.close();
  store = new Store(path);
  try {
    battle = new Battle(() => 0.5, store.restore());
    expect(battle.state.fighters).toHaveLength(3);
    expect(store.ingest(battle, event)).toMatchObject({ accepted: true, duplicate: true });
    expect(battle.state.fighters).toHaveLength(3);
  } finally {
    store.close();
  }
});

test('demo join assigns a server cookie and team switching does not duplicate the viewer', async () => {
  const { post, app } = await setup(true);
  const first = await post('join', { team: 'red', name: 'Browser viewer' });
  expect(first.status).toBe(200);
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  await post('join', { team: 'blue', name: 'Browser viewer' }, { Cookie: cookie });
  expect(app.battle.state.fighters).toHaveLength(1);
  expect(app.battle.state.fighters[0]).toMatchObject({ name: 'Browser viewer', team: 'blue' });
});
