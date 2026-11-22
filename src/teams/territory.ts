import { WORLD, type Team } from './contracts';

export const FIELD = { top: 120, bottom: 665, padding: 38 };
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** One boundary for simulation and drawing, including the curve in the hex field. */
export function frontierX(y: number, territory: number, round: number) {
  return territory * WORLD.width + Math.sin((y / WORLD.height) * 5 + round) * WORLD.width * 0.035;
}

export function territoryRange(
  team: Team,
  y: number,
  territory: number,
  round: number,
  padding = FIELD.padding,
) {
  const front = frontierX(y, territory, round);
  const left = team === 'red' ? 8 : front;
  const right = team === 'red' ? front : WORLD.width - 8;
  // Leave a usable lane even when the losing team's territory becomes very narrow.
  const inset = Math.min(padding, Math.max(0, (right - left - 8) / 2));
  return { min: left + inset, max: right - inset };
}

export function confine(
  point: { x: number; y: number },
  team: Team,
  territory: number,
  round: number,
  padding = FIELD.padding,
) {
  const y = clamp(point.y, FIELD.top, FIELD.bottom);
  const range = territoryRange(team, y, territory, round, padding);
  return { x: clamp(point.x, range.min, range.max), y };
}
