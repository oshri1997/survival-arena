import type { BattleSnapshot } from './contracts';
import type { EventResult } from './Battle';

export interface BattleFeed {
  state?: BattleSnapshot;
  connected: boolean;
  onState(listener: (state: BattleSnapshot) => void): () => void;
  dispose(): void;
}
export class TeamClient implements BattleFeed {
  state?: BattleSnapshot;
  connected = false;
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private attempts = 0;
  private listeners = new Set<(state: BattleSnapshot) => void>();
  constructor() {
    this.connect();
  }
  private connect() {
    if (this.stopped) return;
    const socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/teams/socket`,
    );
    this.socket = socket;
    socket.onopen = () => {
      this.connected = true;
      this.attempts = 0;
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type: string; state: BattleSnapshot };
        if (message.type === 'state') {
          this.state = message.state;
          this.listeners.forEach((fn) => fn(message.state));
        }
      } catch {
        /* Ignore a malformed network frame and wait for the next snapshot. */
      }
    };
    socket.onclose = () => {
      this.connected = false;
      if (this.stopped) return;
      this.retry = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.attempts++));
    };
    socket.onerror = () => socket.close();
  }
  onState(listener: (state: BattleSnapshot) => void) {
    this.listeners.add(listener);
    if (this.state) listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.socket?.close();
    this.listeners.clear();
  }
}
export async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Partial<EventResult> & {
    error?: string;
    viewerId?: string;
  };
  if (!response.ok) throw new Error(result.error ?? result.reason ?? 'Action failed');
  return result;
}
