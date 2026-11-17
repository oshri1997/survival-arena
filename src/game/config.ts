import type { EnemyKind, GiftKind, Skill } from './types';
export const WORLD = { width: 450, height: 800, left: 32, right: 418, top: 125, bottom: 650 };
export const COOLDOWNS: Record<Skill, number> = { nova: 12, frost: 18, lightning: 9 };
export const GIFTS: Record<
  GiftKind,
  { name: string; effect: string; color: string; icon: string }
> = {
  rose: { name: 'Rose', effect: 'Restore 25 health', color: '#f48aab', icon: 'rose' },
  ice: { name: 'Ice heart', effect: 'Freeze enemies · 5s', color: '#8edcfa', icon: 'ice' },
  meteor: { name: 'Meteor', effect: 'Unleash a firestorm', color: '#ffb56c', icon: 'meteor' },
  crown: { name: 'Crown', effect: 'Summon the Hollow King', color: '#e5ca80', icon: 'crown' },
};
export const ENEMIES: Record<
  EnemyKind,
  { hp: number; speed: number; radius: number; score: number }
> = {
  imp: { hp: 28, speed: 30, radius: 13, score: 20 },
  skeleton: { hp: 50, speed: 23, radius: 14, score: 35 },
  wraith: { hp: 35, speed: 43, radius: 13, score: 30 },
  boss: { hp: 650, speed: 15, radius: 33, score: 500 },
};
export const waveCount = (wave: number) => Math.min(12 + (wave - 1) * 4, 60);
export const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
