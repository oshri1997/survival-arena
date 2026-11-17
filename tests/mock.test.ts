import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockProvider } from '../src/integrations/mock/MockProvider';
import type { LiveEvent } from '../src/integrations/events/types';
afterEach(() => vi.useRealTimers());
describe('local mock LIVE provider', () => {
  it('emits all five typed events, identifies mock origin and unsubscribes', () => {
    const provider = new MockProvider(),
      events: LiveEvent[] = [];
    const unsubscribe = provider.subscribe((e) => events.push(e));
    provider.crowd();
    expect(new Set(events.map((e) => e.type)).size).toBe(5);
    expect(events.every((e) => e.source === 'mock')).toBe(true);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    unsubscribe();
    const count = events.length;
    provider.crowd();
    expect(events.length).toBe(count);
  });
  it('gates events when gameplay is inactive and bounds user text', () => {
    const blocked = new MockProvider(() => false),
      listener = vi.fn();
    blocked.subscribe(listener);
    expect(blocked.send('GiftReceived')).toBe(false);
    expect(blocked.crowd()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    const provider = new MockProvider(),
      events: LiveEvent[] = [];
    provider.subscribe((e) => events.push(e));
    provider.send('ChatMessage', { message: 'x'.repeat(500) });
    const chat = events[0];
    expect(chat.type === 'ChatMessage' && chat.message.length).toBe(120);
  });
  it('starts one automatic timer, stops it and disposes subscriptions', () => {
    vi.useFakeTimers();
    const provider = new MockProvider(),
      listener = vi.fn();
    provider.subscribe(listener);
    provider.start();
    provider.start();
    vi.advanceTimersByTime(5500);
    expect(listener).toHaveBeenCalledTimes(1);
    provider.stop();
    vi.advanceTimersByTime(11000);
    expect(listener).toHaveBeenCalledTimes(1);
    provider.start();
    provider.dispose();
    vi.advanceTimersByTime(11000);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
