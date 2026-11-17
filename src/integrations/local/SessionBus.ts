import type { GameState, GiftKind, Skill } from '../../game/types';
import type { LiveEvent } from '../events/types';
export type Command =
  | { kind: 'pause' | 'resume' | 'restart' | 'mute' | 'crowd' }
  | { kind: 'auto'; enabled: boolean }
  | { kind: 'skill'; skill: Skill }
  | { kind: 'gift'; gift: GiftKind }
  | { kind: 'event'; event: LiveEvent };
export type Snapshot = Pick<
  GameState,
  'status' | 'wave' | 'hp' | 'maxHp' | 'kills' | 'score' | 'gifts' | 'time' | 'freeze'
>;
type Message =
  | { type: 'command'; command: Command }
  | { type: 'snapshot'; state: Snapshot }
  | { type: 'activity'; event: LiveEvent };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const oneOf = (v: unknown, values: string[]) => typeof v === 'string' && values.includes(v);
export function isLiveEvent(v: unknown): v is LiveEvent {
  if (
    !record(v) ||
    v.source !== 'mock' ||
    typeof v.id !== 'string' ||
    v.id.length > 100 ||
    !Number.isFinite(v.at) ||
    !record(v.viewer)
  )
    return false;
  if (
    typeof v.viewer.id !== 'string' ||
    v.viewer.id.length > 100 ||
    typeof v.viewer.name !== 'string' ||
    v.viewer.name.length > 40
  )
    return false;
  if (v.type === 'ChatMessage') return typeof v.message === 'string' && v.message.length <= 120;
  if (v.type === 'GiftReceived') return oneOf(v.gift, ['rose', 'ice', 'meteor', 'crown']);
  if (v.type === 'LikeReceived')
    return typeof v.count === 'number' && Number.isFinite(v.count) && v.count > 0 && v.count <= 100;
  return oneOf(v.type, ['ViewerJoined', 'FollowReceived']);
}
export function isCommand(v: unknown): v is Command {
  if (!record(v)) return false;
  if (v.kind === 'gift') return oneOf(v.gift, ['rose', 'ice', 'meteor', 'crown']);
  if (v.kind === 'skill') return oneOf(v.skill, ['nova', 'frost', 'lightning']);
  if (v.kind === 'event') return isLiveEvent(v.event);
  if (v.kind === 'auto') return typeof v.enabled === 'boolean';
  return oneOf(v.kind, ['pause', 'resume', 'restart', 'mute', 'crowd']);
}
const isSnapshot = (v: unknown): v is Snapshot =>
  record(v) &&
  oneOf(v.status, ['ready', 'running', 'paused', 'upgrade', 'gameover']) &&
  ['wave', 'hp', 'maxHp', 'kills', 'score', 'gifts', 'time', 'freeze'].every(
    (k) => typeof v[k] === 'number' && Number.isFinite(v[k]),
  );

/** Same-origin, same-browser mock session. Never carries credentials or network events. */
export class SessionBus {
  private channel?: BroadcastChannel;
  private listeners = new Set<(message: Message) => void>();
  private key: string;
  private source = crypto.randomUUID();
  private seen = new Set<string>();
  private poll?: ReturnType<typeof setInterval>;
  private storageListener = (event: StorageEvent) => {
    if (event.key?.startsWith(this.key + ':') && event.newValue)
      this.consumeStorage(event.newValue);
  };
  private consumeStorage(text: string) {
    try {
      const packets: unknown = JSON.parse(text);
      if (!Array.isArray(packets)) return;
      for (const packet of packets) {
        if (
          !record(packet) ||
          typeof packet.id !== 'string' ||
          packet.source === this.source ||
          this.seen.has(packet.id) ||
          typeof packet.at !== 'number' ||
          Date.now() - packet.at > 10000
        )
          continue;
        this.seen.add(packet.id);
        if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
        this.receive(packet.message);
      }
    } catch {
      /* Ignore malformed or unavailable local storage. */
    }
  }
  constructor(session = 'arena') {
    this.key = `survival-arena:${session.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'arena'}`;
    try {
      this.channel = new BroadcastChannel(this.key);
      this.channel.onmessage = (event) => this.receive(event.data);
    } catch {
      window.addEventListener('storage', this.storageListener);
      // WebKit may defer storage events for an inactive tab; poll the same bounded queues too.
      this.poll = setInterval(() => {
        for (const type of ['command', 'snapshot', 'activity']) {
          try {
            const value = localStorage.getItem(`${this.key}:${type}`);
            if (value) this.consumeStorage(value);
          } catch {
            /* Storage is optional. */
          }
        }
      }, 100);
    }
  }
  private receive(value: unknown) {
    if (!record(value)) return;
    if (
      (value.type === 'command' && isCommand(value.command)) ||
      (value.type === 'snapshot' && isSnapshot(value.state)) ||
      (value.type === 'activity' && isLiveEvent(value.event))
    )
      this.listeners.forEach((fn) => fn(value as Message));
  }
  on(listener: (message: Message) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  send(message: Message) {
    if (this.channel) this.channel.postMessage(message);
    else
      try {
        const key = `${this.key}:${message.type}`;
        const previous: unknown = JSON.parse(localStorage.getItem(key) || '[]');
        const queue = Array.isArray(previous)
          ? previous.slice(message.type === 'snapshot' ? -1 : -24)
          : [];
        queue.push({ id: crypto.randomUUID(), source: this.source, at: Date.now(), message });
        localStorage.setItem(key, JSON.stringify(queue));
      } catch {
        /* Storage can be disabled in private browsing. */
      }
  }

  dispose() {
    this.channel?.close();
    clearInterval(this.poll);
    window.removeEventListener('storage', this.storageListener);
    this.listeners.clear();
  }
}
