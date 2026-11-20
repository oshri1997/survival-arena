import { afterEach, expect, test } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const children = new Set<ChildProcessWithoutNullStreams>();
const directories: string[] = [];
async function stop(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) {
    children.delete(child);
    return;
  }
  const exited = once(child, 'exit');
  child.kill(signal);
  const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
    children.delete(child);
  }
}
afterEach(async () => {
  for (const child of children) await stop(child);
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
const adminKey = 'process-integration-admin-key';
const eventKey = 'process-integration-event-key';
function launch(path: string, credentials = true) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      TEAM_ADMIN_KEY: credentials ? adminKey : '',
      TEAM_EVENT_KEY: credentials ? eventKey : '',
      TEAM_STATE_PATH: path,
      TEAM_DEMO_JOIN: 'false',
      TEAM_SEED_DEMO: 'false',
    },
  });
  children.add(child);
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (data) => {
    stdout += String(data);
  });
  child.stderr.on('data', (data) => {
    stderr += String(data);
  });
  return { child, stdout: () => stdout, stderr: () => stderr };
}
async function ready(instance: ReturnType<typeof launch>) {
  for (let i = 0; i < 100; i++) {
    const match = instance.stdout().match(/Team Arena http:\/\/localhost:(\d+)\//);
    if (match) return `http://127.0.0.1:${match[1]}`;
    if (instance.child.exitCode !== null) throw new Error('Server exited before becoming ready');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Server did not start within five seconds');
}
async function stateDirectory() {
  const dir = await mkdtemp(join(tmpdir(), 'arena-process-'));
  directories.push(dir);
  return join(dir, 'state.sqlite');
}
async function post(
  url: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(url + '/api/teams/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('a production process survives abrupt termination without replaying acknowledged gifts or retaining old admin sessions', async () => {
  const path = await stateDirectory();
  let instance = launch(path),
    url = await ready(instance);
  expect(await (await fetch(url + '/api/teams/health')).json()).toMatchObject({ ok: true });
  expect(await (await fetch(url + '/api/teams/state')).json()).toMatchObject({
    fighters: [],
    autoplay: false,
    demoJoin: false,
  });
  const login = await post(url, 'admin/login', { key: adminKey });
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const headers = { Authorization: 'Bearer ' + eventKey };
  const viewer = { id: 'live-viewer', name: 'Luna' };
  expect(
    (
      await post(
        url,
        'events',
        { id: 'stream1:chat:1', type: 'chat', viewer, message: 'red' },
        headers,
      )
    ).status,
  ).toBe(200);
  const gift = { id: 'stream1:gift:1', type: 'gift', viewer, gift: 'reinforce', amount: 1 };
  expect(await (await post(url, 'events', gift, headers)).json()).toMatchObject({
    accepted: true,
    duplicate: false,
  });
  await stop(instance.child, 'SIGKILL');
  instance = launch(path);
  url = await ready(instance);
  expect(await (await post(url, 'events', gift, headers)).json()).toMatchObject({
    accepted: true,
    duplicate: true,
  });
  const snapshot = await (await fetch(url + '/api/teams/state')).json();
  expect(snapshot.fighters).toHaveLength(4);
  expect((await post(url, 'events', { ...gift, amount: 2 }, headers)).status).toBe(409);
  expect(
    await (await fetch(url + '/api/teams/admin/session', { headers: { Cookie: cookie } })).json(),
  ).toEqual({ authenticated: false });
  expect((await post(url, 'admin/actions', { type: 'restart' }, { Cookie: cookie })).status).toBe(
    401,
  );
  expect(instance.stdout()).not.toContain(eventKey);
  expect(instance.stdout()).not.toContain(adminKey);
  await stop(instance.child);
}, 20000);

test('production startup fails before opening the game when server credentials are absent', async () => {
  const instance = launch(await stateDirectory(), false);
  const [code] = await once(instance.child, 'exit');
  children.delete(instance.child);
  expect(code).not.toBe(0);
  expect(instance.stderr()).toContain('Set TEAM_ADMIN_KEY and TEAM_EVENT_KEY');
  expect(instance.stdout()).not.toContain('Team Arena http');
}, 10000);
