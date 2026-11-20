import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Battle } from '../src/teams/Battle';
import {
  adminActionSchema,
  audienceEventSchema,
  teamSchema,
  type AudienceEvent,
  type BattleSnapshot,
  type Team,
  type Viewer,
} from '../src/teams/contracts';
import { Store } from './store';

interface ServerOptions {
  adminKey: string;
  eventKey: string;
  statePath: string;
  distPath: string;
  demoJoin?: boolean;
  seedDemo?: boolean;
}
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const cookies = (req: IncomingMessage) =>
  Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf('=');
        return [pair.slice(0, index).trim(), pair.slice(index + 1)];
      }),
  );
const names = [
  'Luna',
  'Kai',
  'Nora',
  'Leo',
  'Maya',
  'Ari',
  'Owl',
  'Nova',
  'Ember',
  'Storm',
  'River',
  'Jade',
  'Milo',
  'Vega',
  'Sage',
  'Echo',
  'Atlas',
  'Ruby',
  'Skye',
  'Rex',
  'Kira',
  'Finn',
  'Ivy',
  'Zane',
  'Aya',
  'Oak',
  'Lior',
  'Ziv',
  'Noa',
  'Lily',
  'Rin',
  'Ace',
];

export function createBattleServer(options: ServerOptions) {
  const store = new Store(options.statePath);
  const restored = store.restore();
  const battle = new Battle(Math.random, restored);
  const sessions = new Map<string, number>();
  const limits = new Map<string, { count: number; until: number }>();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  let closed = false,
    nextSimulation = 4,
    last = Date.now(),
    lastSave = last;
  const demoJoin = options.demoJoin ?? true;
  const accept = (event: AudienceEvent) => store.ingest(battle, event);
  const addCrowd = (count: number) => {
    for (let i = 0; i < count; i++) {
      const index = battle.state.fighters.filter((f) => !f.temporary).length;
      const viewer: Viewer = { id: `demo-${randomUUID()}`, name: names[index % names.length] };
      accept({ id: randomUUID(), type: 'join', viewer, team: index % 2 ? 'blue' : 'red' });
    }
  };
  if (!restored && options.seedDemo !== false) {
    addCrowd(24);
    battle.state.autoplay = true;
    store.save(battle.state);
  }
  const snapshot = (): BattleSnapshot => ({ ...battle.state, connected: true, demoJoin });
  const broadcast = () => {
    const message = JSON.stringify({ type: 'state', state: snapshot() });
    for (const socket of sockets.clients)
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 256000)
        socket.send(message);
  };
  const respond = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(data));
  };
  const body = async (req: IncomingMessage) => {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) throw new Error('Request too large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  };
  const limited = (req: IncomingMessage, category: string, maximum: number) => {
    const key = `${category}:${req.socket.remoteAddress}`;
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + 10000 };
      limits.set(key, entry);
    }
    if (limits.size > 1000)
      for (const [id, limit] of limits) if (limit.until < now) limits.delete(id);
    return ++entry.count > maximum;
  };
  const isAdmin = (req: IncomingMessage) => {
    const token = cookies(req).team_admin;
    const expires = token ? sessions.get(token) : undefined;
    return !!expires && expires > Date.now();
  };
  const sameOrigin = (req: IncomingMessage) => {
    try {
      return !req.headers.origin || new URL(req.headers.origin).host === req.headers.host;
    } catch {
      return false;
    }
  };
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
      if (path.startsWith('/api/teams')) {
        if (req.method === 'GET' && path === '/api/teams/state') {
          respond(res, 200, snapshot());
          return;
        }
        if (req.method === 'GET' && path === '/api/teams/health') {
          respond(res, 200, { ok: true, round: battle.state.round });
          return;
        }
        if (req.method === 'GET' && path === '/api/teams/admin/session') {
          respond(res, 200, { authenticated: isAdmin(req) });
          return;
        }
        if (req.method !== 'POST') {
          respond(res, 405, { error: 'Method not allowed' });
          return;
        }
        if (!sameOrigin(req)) {
          respond(res, 403, { error: 'Origin rejected' });
          return;
        }
        if (path === '/api/teams/admin/login') {
          if (limited(req, 'login', 8)) {
            respond(res, 429, { error: 'Try again shortly' });
            return;
          }
          const input = (await body(req)) as { key?: unknown };
          if (typeof input?.key !== 'string' || !safeEqual(input.key, options.adminKey)) {
            respond(res, 401, { error: 'Incorrect admin key' });
            return;
          }
          for (const [key, expiry] of sessions) if (expiry < Date.now()) sessions.delete(key);
          if (sessions.size >= 30) {
            respond(res, 429, { error: 'Too many active admin sessions' });
            return;
          }
          const token = randomBytes(24).toString('hex');
          sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
          const secure =
            req.headers['x-forwarded-proto'] === 'https' ||
            (req.socket as { encrypted?: boolean }).encrypted;
          res.setHeader(
            'Set-Cookie',
            `team_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/teams; Max-Age=43200${secure ? '; Secure' : ''}`,
          );
          respond(res, 200, { ok: true });
          return;
        }
        if (path === '/api/teams/admin/logout') {
          sessions.delete(cookies(req).team_admin);
          res.setHeader(
            'Set-Cookie',
            'team_admin=; HttpOnly; SameSite=Strict; Path=/api/teams; Max-Age=0',
          );
          respond(res, 200, { ok: true });
          return;
        }
        if (path === '/api/teams/events') {
          const authorization = req.headers.authorization ?? '';
          if (!safeEqual(authorization, `Bearer ${options.eventKey}`)) {
            respond(res, 401, { error: 'Event key required' });
            return;
          }
          if (limited(req, 'events', 200)) {
            respond(res, 429, { error: 'Event rate exceeded' });
            return;
          }
          const parsed = audienceEventSchema.safeParse(await body(req));
          if (!parsed.success) {
            respond(res, 400, { error: 'Invalid event', details: parsed.error.flatten() });
            return;
          }
          const result = accept(parsed.data);
          respond(res, result.accepted ? 200 : 409, result);
          broadcast();
          return;
        }
        if (path === '/api/teams/admin/actions') {
          if (!isAdmin(req)) {
            respond(res, 401, { error: 'Admin login required' });
            return;
          }
          if (limited(req, 'admin', 100)) {
            respond(res, 429, { error: 'Too many actions' });
            return;
          }
          const parsed = adminActionSchema.safeParse(await body(req));
          if (!parsed.success) {
            respond(res, 400, { error: 'Invalid action' });
            return;
          }
          const action = parsed.data;
          if (action.type === 'pause') battle.state.paused = action.paused;
          if (action.type === 'restart') battle.restart();
          if (action.type === 'autoplay') battle.state.autoplay = action.enabled;
          if (action.type === 'crowd') addCrowd(action.count);
          if (action.type === 'event') {
            const result = accept(action.event);
            respond(res, result.accepted ? 200 : 409, result);
            broadcast();
            return;
          }
          store.save(battle.state);
          respond(res, 200, { ok: true });
          broadcast();
          return;
        }
        if (path === '/api/teams/join') {
          if (!demoJoin) {
            respond(res, 403, { error: 'Join through chat in the connected stream' });
            return;
          }
          if (limited(req, 'join', 12)) {
            respond(res, 429, { error: 'Please wait before changing teams' });
            return;
          }
          const input = (await body(req)) as { team?: unknown; name?: unknown };
          const team = teamSchema.safeParse(input?.team);
          if (!team.success) {
            respond(res, 400, { error: 'Choose red or blue' });
            return;
          }
          const existing = cookies(req).team_viewer;
          const id =
            existing && /^[a-f0-9]{32}$/.test(existing)
              ? existing
              : randomBytes(16).toString('hex');
          res.setHeader(
            'Set-Cookie',
            `team_viewer=${id}; HttpOnly; SameSite=Strict; Path=/api/teams; Max-Age=86400${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`,
          );
          const name = typeof input.name === 'string' ? input.name.trim().slice(0, 32) : 'You';
          const result = accept({
            id: randomUUID(),
            type: 'join',
            viewer: { id: `browser-${id}`, name: name || 'You' },
            team: team.data,
          });
          respond(res, result.accepted ? 200 : 409, result);
          broadcast();
          return;
        }
        respond(res, 404, { error: 'Unknown endpoint' });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        respond(res, 405, { error: 'Method not allowed' });
        return;
      }
      const requested =
        decodeURIComponent(path) === '/' ? 'teams.html' : decodeURIComponent(path).slice(1);
      const filename = resolve(options.distPath, requested);
      if (!filename.startsWith(resolve(options.distPath) + '/')) {
        respond(res, 403, { error: 'Forbidden' });
        return;
      }
      try {
        if (!(await stat(filename)).isFile()) throw new Error('Not a file');
        const mime: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.ttf': 'font/ttf',
          '.webp': 'image/webp',
          '.txt': 'text/plain',
        };
        res.writeHead(200, {
          'Content-Type': mime[extname(filename)] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : await readFile(filename));
      } catch {
        respond(res, 404, { error: 'File not found' });
      }
    } catch (error) {
      respond(res, 400, { error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/api/teams/socket' || !sameOrigin(req) || sockets.clients.size >= 100) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => {
      sockets.emit('connection', ws, req);
      ws.send(JSON.stringify({ type: 'state', state: snapshot() }));
      ws.on('message', () => ws.close(1008, 'Viewer connections are read only'));
      ws.on('error', () => ws.terminate());
    });
  });
  let broadcasts = 0;
  const timer = setInterval(() => {
    const now = Date.now(),
      elapsed = Math.min((now - last) / 1000, 0.5);
    last = now;
    for (let remaining = elapsed; remaining > 0; remaining -= 0.05)
      battle.update(Math.min(0.05, remaining));
    if (battle.state.autoplay && !battle.state.paused && battle.state.phase === 'battle') {
      nextSimulation -= elapsed;
      if (nextSimulation <= 0) {
        nextSimulation = 5;
        const players = battle.state.fighters.filter((f) => !f.temporary);
        const player = players[Math.floor(Math.random() * players.length)];
        if (player) {
          const team: Team = player.team;
          const viewer: Viewer = { id: player.ownerId, name: player.name };
          accept({
            id: randomUUID(),
            type: 'gift',
            viewer,
            team,
            gift: Math.random() < 0.5 ? 'shield' : 'boost',
            amount: 1,
          });
        }
      }
    }
    if (++broadcasts % 2 === 0) broadcast();
    if (now - lastSave > 1000) {
      store.save(battle.state);
      lastSave = now;
    }
  }, 50);
  const heartbeat = setInterval(() => {
    for (const client of sockets.clients) if (client.readyState === WebSocket.OPEN) client.ping();
  }, 20000);
  return {
    server,
    battle,
    store,
    close: async () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const socket of sockets.clients) socket.close(1012, 'Server restarting');
      const terminate = setTimeout(() => {
        for (const socket of sockets.clients) socket.terminate();
      }, 1000);
      terminate.unref();
      store.save(battle.state);
      store.close();
      sockets.close();
      if (server.listening)
        await new Promise<void>((resolveClose, reject) =>
          server.close((error) => (error ? reject(error) : resolveClose())),
        );
      clearTimeout(terminate);
    },
  };
}
