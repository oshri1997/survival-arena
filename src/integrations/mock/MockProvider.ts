import type { GiftKind } from '../../game/types';
import type { EventProvider, LiveEvent, Viewer } from '../events/types';
const names = ['Luna', 'Kai', 'MossMage', 'Ember', 'NightOwl', 'Sage', 'Willow', 'PixelKnight'];
export class MockProvider implements EventProvider {
  readonly mode = 'mock' as const;
  private listeners = new Set<(event: LiveEvent) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private sequence = 0;
  private cursor = 0;
  constructor(private canSend: () => boolean = () => true) {}
  subscribe(listener: (event: LiveEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private viewer(): Viewer {
    const index = this.cursor++ % names.length;
    return { id: `mock-${index}`, name: names[index] };
  }
  send(
    type: LiveEvent['type'],
    payload: { gift?: GiftKind; message?: string; count?: number } = {},
  ) {
    if (!this.canSend()) return false;
    const base = {
      id: `mock-event-${++this.sequence}`,
      at: Date.now(),
      viewer: this.viewer(),
      source: 'mock' as const,
    };
    let event: LiveEvent;
    switch (type) {
      case 'GiftReceived':
        event = { ...base, type, gift: payload.gift ?? 'rose' };
        break;
      case 'ChatMessage':
        event = {
          ...base,
          type,
          message: (payload.message ?? 'Protect the crystal! ✨').slice(0, 120),
        };
        break;
      case 'LikeReceived':
        event = {
          ...base,
          type,
          count: Math.max(1, Math.min(100, Math.floor(payload.count ?? 10))),
        };
        break;
      default:
        event = { ...base, type };
    }
    this.listeners.forEach((listener) => listener(event));
    return true;
  }
  crowd() {
    if (!this.canSend()) return false;
    for (let i = 0; i < 4; i++) this.send('ViewerJoined');
    this.send('ChatMessage', { message: 'We’ve got your back, guardian.' });
    this.send('LikeReceived', { count: 25 });
    this.send('GiftReceived', { gift: 'ice' });
    this.send('FollowReceived');
    return true;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.canSend()) return;
      const step = this.sequence % 5;
      if (step === 0) this.send('ViewerJoined');
      else if (step === 1) this.send('ChatMessage');
      else if (step === 2) this.send('LikeReceived');
      else if (step === 3)
        this.send('GiftReceived', {
          gift: ['rose', 'ice', 'meteor'][Math.floor(this.sequence / 5) % 3] as GiftKind,
        });
      else this.send('FollowReceived');
    }, 5500);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  dispose() {
    this.stop();
    this.listeners.clear();
  }
}
