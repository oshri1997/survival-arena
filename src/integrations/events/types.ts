import type { GiftKind } from '../../game/types';
export interface Viewer {
  id: string;
  name: string;
}
interface BaseEvent {
  id: string;
  at: number;
  viewer: Viewer;
  source: 'mock';
}
export type LiveEvent = BaseEvent &
  (
    | { type: 'ViewerJoined' }
    | { type: 'ChatMessage'; message: string }
    | { type: 'LikeReceived'; count: number }
    | { type: 'GiftReceived'; gift: GiftKind }
    | { type: 'FollowReceived' }
  );
export interface EventProvider {
  readonly mode: 'mock';
  subscribe(listener: (event: LiveEvent) => void): () => void;
  start(): void;
  stop(): void;
}
