import { describe, it, expect } from 'vitest';
import { isCommand, isLiveEvent } from '../src/integrations/local/SessionBus';
const base = { id: 'mock-1', at: 123, viewer: { id: 'viewer-1', name: 'Luna' }, source: 'mock' };
describe('local studio command boundary', () => {
  it('accepts only known actions and mock event payloads', () => {
    expect(isCommand({ kind: 'gift', gift: 'meteor' })).toBe(true);
    expect(isCommand({ kind: 'skill', skill: 'frost' })).toBe(true);
    expect(isCommand({ kind: 'gift', gift: 'unknown' })).toBe(false);
    expect(isCommand({ kind: 'auto', enabled: 'true' })).toBe(false);
    expect(isLiveEvent({ ...base, type: 'ChatMessage', message: 'fire' })).toBe(true);
    expect(isCommand({ kind: 'event', event: { ...base, type: 'LikeReceived', count: 20 } })).toBe(
      true,
    );
    expect(isLiveEvent({ ...base, type: 'LikeReceived', count: NaN })).toBe(false);
    expect(isLiveEvent({ ...base, type: 'ChatMessage', message: 'x'.repeat(121) })).toBe(false);
    expect(isLiveEvent({ ...base, source: 'live', type: 'GiftReceived', gift: 'rose' })).toBe(
      false,
    );
  });
});
