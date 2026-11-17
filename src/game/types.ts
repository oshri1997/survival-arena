export type Vec = { x: number; y: number };
export type Status = 'ready' | 'running' | 'paused' | 'upgrade' | 'gameover';
export type EnemyKind = 'imp' | 'skeleton' | 'wraith' | 'boss';
export type Skill = 'nova' | 'frost' | 'lightning';
export type Upgrade = 'power' | 'vitality' | 'haste';
export type GiftKind = 'rose' | 'ice' | 'meteor' | 'crown';
export type Sound =
  'shot' | 'hit' | 'kill' | 'nova' | 'frost' | 'gift' | 'boss' | 'wave' | 'lightning' | 'defeat';
export interface Enemy extends Vec {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  phase: number;
  hit: number;
  attack: number;
}
export interface Projectile extends Vec {
  vx: number;
  vy: number;
  life: number;
  damage: number;
  hostile: boolean;
}
export interface Particle extends Vec {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}
export interface Ring extends Vec {
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}
export interface FloatText extends Vec {
  text: string;
  color: string;
  life: number;
}
export interface Hazard extends Vec {
  radius: number;
  remaining: number;
}
export interface GameState {
  status: Status;
  wave: number;
  kills: number;
  score: number;
  time: number;
  xp: number;
  hp: number;
  maxHp: number;
  player: Vec;
  damage: number;
  fireRate: number;
  shootTimer: number;
  invulnerable: number;
  freeze: number;
  shake: number;
  flash: number;
  cooldowns: Record<Skill, number>;
  enemies: Enemy[];
  shots: Projectile[];
  particles: Particle[];
  rings: Ring[];
  texts: FloatText[];
  hazards: Hazard[];
  spawnRemaining: number;
  waveTotal: number;
  waveKilled: number;
  spawnTimer: number;
  waveBreak: number;
  gifts: number;
  best: number;
}
export type GameEvent =
  | { type: 'spell'; effect: 'lightning' | 'meteor'; targets: Vec[] }
  | { type: 'sound'; sound: Sound }
  | { type: 'wave'; wave: number }
  | { type: 'boss' }
  | { type: 'defeat'; score: number };
