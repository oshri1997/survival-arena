import { expect, test } from 'vitest';
import { smoothPosition } from '../src/teams/motion';

test.each([30, 60])(
  'fighters glide evenly between 10 Hz snapshots at %i frames per second',
  (fps) => {
    const dt = 1 / fps;
    const fighter = { x: 0, y: 0, vx: 48, vy: 24 };
    let rendered = { x: 0, y: 0 };
    for (let frame = 1; frame <= fps * 2; frame++) {
      const time = frame * dt;
      const snapshot = Math.floor((10 * frame) / fps) / 10;
      const next = smoothPosition(
        rendered,
        { ...fighter, x: snapshot * fighter.vx, y: snapshot * fighter.vy },
        dt,
        time - snapshot,
      );
      if (time > 0.5) {
        expect(next.x - rendered.x).toBeCloseTo(fighter.vx * dt, 2);
        expect(next.y - rendered.y).toBeCloseTo(fighter.vy * dt, 2);
      }
      rendered = next;
    }
  },
);

test('the avatar stops predicting after 100 ms and settles to the authoritative paused position', () => {
  const fighter = { x: 120, y: 240, vx: 48, vy: -24 };
  const position = { x: 120, y: 240 };
  expect(smoothPosition(position, fighter, 0.05, 1)).toEqual(
    smoothPosition(position, fighter, 0.05, 0.1),
  );
  expect(smoothPosition(position, fighter, 0.05, 0)).toEqual(position);
});
