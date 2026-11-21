import { expect, test } from 'vitest';
import { ConfirmedToggle } from '../src/teams/ConfirmedToggle';

test('stale snapshots cannot undo a pending click; state settles only after acknowledgement and snapshot', () => {
  const t = new ConfirmedToggle();
  t.receive(true);
  const revision = t.request(false)!;
  t.receive(true);
  expect(t.value).toBe(false);
  expect(t.pending).toBe(true);
  t.acknowledge(revision);
  expect(t.pending).toBe(true);
  t.receive(false);
  expect(t.pending).toBe(false);
  expect(t.value).toBe(false);
});
test('a matching snapshot can arrive before the HTTP response', () => {
  const t = new ConfirmedToggle();
  const revision = t.request(true)!;
  t.receive(true);
  expect(t.pending).toBe(true);
  t.acknowledge(revision);
  expect(t.pending).toBe(false);
  expect(t.value).toBe(true);
});
test('a rejected request returns to the most recently observed remote state', () => {
  const t = new ConfirmedToggle();
  t.receive(true);
  const revision = t.request(false)!;
  t.receive(true);
  t.cancel(revision);
  expect(t.value).toBe(true);
  expect(t.pending).toBe(false);
});
test('overlapping requests are prevented and late acknowledgements cannot confirm a newer request', () => {
  const t = new ConfirmedToggle();
  const first = t.request(true)!;
  expect(t.request(false)).toBeUndefined();
  t.cancel(first);
  const second = t.request(false)!;
  t.acknowledge(first);
  expect(t.pending).toBe(true);
  t.acknowledge(second);
  expect(t.pending).toBe(false);
  expect(t.value).toBe(false);
});
