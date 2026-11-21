import type { Fighter } from './contracts';

type Position = Pick<Fighter, 'x' | 'y'>;

export function smoothPosition(
  position: Position,
  fighter: Pick<Fighter, 'x' | 'y' | 'vx' | 'vy'>,
  dt: number,
  snapshotAge: number,
): Position {
  // The server publishes at 10 Hz. Cap prediction so stale snapshots cannot cause drift.
  const prediction = Math.min(snapshotAge, 0.1);
  const blend = 1 - Math.exp(-dt * 12);
  return {
    x: position.x + (fighter.x + (fighter.vx ?? 0) * prediction - position.x) * blend,
    y: position.y + (fighter.y + (fighter.vy ?? 0) * prediction - position.y) * blend,
  };
}
