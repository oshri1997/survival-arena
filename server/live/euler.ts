import { WebSocket } from 'ws';
import { z } from 'zod';
import { liveEventSchema, type LiveBinding, type LiveEvent } from './contracts';
import { viewerSchema } from '../../src/teams/contracts';

const identifier = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value !== '0');
const userSchema = z.object({
  id: identifier,
  nickname: z.string().catch(''),
  displayId: z.string().catch(''),
  avatarThumb: z
    .object({ urlList: z.array(z.string()).catch([]) })
    .nullish()
    .catch(undefined),
});
const messageSchema = z.object({
  common: z.object({ msgId: identifier, roomId: identifier }),
  user: userSchema,
});
const frameSchema = z.object({ type: z.string(), data: z.unknown() });
/** Euler JSON schema v3. Unknown message classes are deliberately not treated as gifts. */
export function normalizeEuler(type: string, input: unknown): LiveEvent | undefined {
  if (
    ![
      'WebcastChatMessage',
      'WebcastMemberMessage',
      'WebcastLikeMessage',
      'WebcastSocialMessage',
      'WebcastGiftMessage',
    ].includes(type)
  )
    return;
  const basic = messageSchema.parse(input);
  const candidate = basic.user.avatarThumb?.urlList.find(
    (url) => viewerSchema.shape.avatar.safeParse(url).success,
  );
  const base = {
    id: basic.common.msgId,
    roomId: basic.common.roomId,
    viewer: {
      id: basic.user.id,
      name:
        (basic.user.nickname || basic.user.displayId || 'Viewer').trim().slice(0, 32) || 'Viewer',
      ...(candidate ? { avatar: candidate } : {}),
    },
  };
  if (type === 'WebcastChatMessage')
    return liveEventSchema.parse({
      ...base,
      type: 'chat',
      message: z.object({ content: z.string() }).parse(input).content.slice(0, 200),
    });
  if (type === 'WebcastMemberMessage')
    return liveEventSchema.parse({ ...base, type: 'viewerJoined' });
  if (type === 'WebcastLikeMessage')
    return liveEventSchema.parse({
      ...base,
      type: 'like',
      count: z.object({ count: z.number() }).parse(input).count,
    });
  if (type === 'WebcastSocialMessage') {
    const social = z.object({ action: z.union([z.string(), z.number()]) }).parse(input);
    if (String(social.action) === '1') return liveEventSchema.parse({ ...base, type: 'follow' });
    return;
  }
  const gift = z
    .object({
      giftId: identifier,
      repeatCount: z.number(),
      repeatEnd: z.number().int().min(0).max(1),
      groupId: z.string().optional(),
      toUser: z.object({ id: identifier }),
      gift: z.object({ name: z.string().nullish().catch(undefined), type: z.number().int() }),
    })
    .parse(input);
  return liveEventSchema.parse({
    ...base,
    type: 'gift',
    giftId: gift.giftId,
    giftName: gift.gift.name?.trim().slice(0, 100) || `Gift ${gift.giftId}`,
    recipientId: gift.toUser.id,
    count: gift.repeatCount,
    streak: gift.gift.type === 1,
    streakEnd: gift.repeatEnd === 1,
    ...(gift.groupId && gift.groupId !== '0' ? { seriesId: gift.groupId } : {}),
  });
}

export interface ConnectorStatus {
  state: 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'ended' | 'error' | 'stopped';
  attempt: number;
  lastEventAt?: number;
  lastCloseCode?: number;
  invalid: number;
  ignored: number;
  reason?: string;
}
interface Options {
  username: string;
  apiKey: string;
  creatorId: string;
  accept: (event: LiveEvent) => unknown;
  bind: (binding: LiveBinding) => void;
  status: (status: ConnectorStatus) => void;
  // Injectable only for local transport tests; never read an endpoint from a browser.
  endpoint?: string;
  retryMs?: number;
}
/** Independent server-side collector. No TikTok password, cookie or OAuth token is used. */
export class EulerConnector {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private stopped = false;
  private binding?: LiveBinding;
  private status: ConnectorStatus = { state: 'connecting', attempt: 0, invalid: 0, ignored: 0 };
  constructor(private options: Options) {}
  start() {
    this.stopped = false;
    this.connect();
  }
  private report(patch: Partial<ConnectorStatus>) {
    this.status = { ...this.status, ...patch };
    this.options.status({ ...this.status });
  }
  private connect() {
    if (this.stopped || this.socket) return;
    this.binding = undefined;
    this.report({
      state: this.status.attempt ? 'reconnecting' : 'connecting',
      attempt: this.status.attempt + 1,
    });
    const url = new URL(this.options.endpoint ?? 'wss://ws.eulerstream.com');
    url.search = new URLSearchParams({
      apiKey: this.options.apiKey,
      uniqueId: this.options.username.replace(/^@/, ''),
      'features.schemaVersion': 'v3',
      'features.bundleEvents': 'true',
      'features.rawMessages': 'false',
    }).toString();
    const ws = (this.socket = new WebSocket(url, {
      maxPayload: 2_000_000,
      handshakeTimeout: 15000,
    }));
    let alive = true;
    ws.on('pong', () => {
      alive = true;
    });
    ws.on('open', () => {
      // A socket opening is not evidence that TikTok itself is connected.
      this.heartbeat = setInterval(() => {
        if (!alive) {
          ws.terminate();
          return;
        }
        alive = false;
        ws.ping();
      }, 20000);
    });
    ws.on('message', (data) => {
      try {
        const frame: unknown = JSON.parse(String(data));
        const bundled = z.object({ messages: z.array(z.unknown()).max(2000) }).safeParse(frame);
        for (const message of bundled.success ? bundled.data.messages : [frame]) {
          try {
            this.receive(message);
          } catch {
            this.report({
              invalid: this.status.invalid + 1,
              reason:
                'Malformed event or persistence failure; inspect provider delivery before going LIVE',
            });
          }
        }
      } catch {
        this.report({ invalid: this.status.invalid + 1, reason: 'Invalid provider frame' });
      }
    });
    // Never print an SDK/network error: it may contain the authenticated URL.
    ws.on('error', () => this.report({ state: 'error', reason: 'Provider transport error' }));
    ws.on('close', (code) => {
      clearInterval(this.heartbeat);
      this.socket = undefined;
      const terminal = [4400, 4401, 4403].includes(code);
      const offline = code === 4404 || code === 4005;
      this.report({
        state: this.stopped ? 'stopped' : offline ? (code === 4005 ? 'ended' : 'offline') : 'error',
        lastCloseCode: code,
        reason: terminal
          ? 'Check provider credentials, permissions and configuration'
          : code === 4429
            ? 'Provider connection quota reached'
            : offline
              ? 'Waiting for the broadcaster to go LIVE'
              : 'Provider disconnected; delivery gap possible',
      });
      if (!this.stopped && !terminal) {
        const delay =
          this.options.retryMs ??
          (offline ? 60000 : Math.min(60000, 2000 * 2 ** Math.min(this.status.attempt - 1, 5)));
        this.timer = setTimeout(() => this.connect(), delay);
      }
    });
  }
  private receive(input: unknown) {
    const frame = frameSchema.parse(input);
    if (frame.type === 'room.status') {
      const data = z
        .object({
          state: z.enum(['connecting', 'connected', 'reconnecting', 'offline', 'ended', 'error']),
          roomId: identifier.optional(),
        })
        .parse(frame.data);
      if (data.roomId) this.bind(data.roomId);
      this.report({ state: data.state, reason: undefined });
      return;
    }
    const event = normalizeEuler(frame.type, frame.data);
    if (!event) {
      this.report({ ignored: this.status.ignored + 1 });
      return;
    }
    // On older gateways without room.status, the authenticated username-scoped stream supplies the room ID.
    if (!this.binding) this.bind(event.roomId);
    this.options.accept(event);
    this.report({ state: 'connected', lastEventAt: Date.now(), reason: undefined });
  }
  private bind(roomId: string) {
    this.binding = { roomId, creatorId: this.options.creatorId };
    this.options.bind(this.binding);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.socket?.terminate();
    this.report({ state: 'stopped' });
  }
}
