import { COOLDOWNS, ENEMIES, waveCount } from './config';
import type {
  Enemy,
  EnemyKind,
  GameEvent,
  GameState,
  GiftKind,
  Skill,
  Upgrade,
  Vec,
} from './types';

/** Pure simulation: seconds, logical portrait coordinates, no browser or rendering dependencies. */
export class Game {
  state: GameState;
  private id = 0;
  private listeners = new Set<(event: GameEvent) => void>();
  constructor(
    private random: () => number = Math.random,
    best = 0,
    private externalCollisions = false,
  ) {
    this.state = this.initial(best);
  }
  private initial(best: number): GameState {
    return {
      status: 'ready',
      wave: 1,
      kills: 0,
      score: 0,
      time: 0,
      xp: 0,
      hp: 100,
      maxHp: 100,
      player: { x: 225, y: 410 },
      damage: 22,
      fireRate: 0.55,
      shootTimer: 0,
      invulnerable: 0,
      freeze: 0,
      shake: 0,
      flash: 0,
      cooldowns: { nova: 0, frost: 0, lightning: 0 },
      enemies: [],
      shots: [],
      particles: [],
      rings: [],
      texts: [],
      hazards: [],
      spawnRemaining: waveCount(1),
      waveTotal: waveCount(1),
      waveKilled: 0,
      spawnTimer: 0.5,
      waveBreak: 0,
      gifts: 0,
      best,
    };
  }
  on(listener: (event: GameEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(event: GameEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
  private sound(sound: Extract<GameEvent, { type: 'sound' }>['sound']) {
    this.emit({ type: 'sound', sound });
  }
  start() {
    this.state = this.initial(this.state.best);
    this.state.status = 'running';
    this.sound('wave');
  }
  pause() {
    if (this.state.status === 'running') this.state.status = 'paused';
  }
  resume() {
    if (this.state.status === 'paused') this.state.status = 'running';
  }
  upgrade(choice: Upgrade) {
    const s = this.state;
    if (s.status !== 'upgrade') return false;
    if (choice === 'power') s.damage += 7;
    if (choice === 'vitality') {
      s.maxHp += 20;
      s.hp = Math.min(s.maxHp, s.hp + 35);
    }
    if (choice === 'haste') {
      s.fireRate = Math.max(0.18, s.fireRate * 0.88);
    }
    s.wave++;
    s.waveTotal = waveCount(s.wave);
    s.spawnRemaining = s.waveTotal;
    s.waveKilled = 0;
    s.spawnTimer = 1;
    s.waveBreak = 0;
    s.status = 'running';
    s.hp = Math.min(s.maxHp, s.hp + 8);
    if (s.wave % 5 === 0) this.summonBoss();
    this.emit({ type: 'wave', wave: s.wave });
    this.sound('wave');
    return true;
  }
  spawn(kind?: EnemyKind): Enemy {
    const s = this.state,
      side = Math.floor(this.random() * 4);
    const x = side === 0 ? 25 : side === 1 ? 425 : 45 + this.random() * 360;
    const y = side === 2 ? 130 : side === 3 ? 640 : 150 + this.random() * 460;
    kind ??=
      s.wave < 2
        ? 'imp'
        : this.random() < 0.3
          ? 'wraith'
          : this.random() < 0.55
            ? 'skeleton'
            : 'imp';
    const spec = ENEMIES[kind],
      hp = spec.hp * (1 + (s.wave - 1) * 0.12);
    const enemy: Enemy = {
      id: ++this.id,
      x,
      y,
      kind,
      hp,
      maxHp: hp,
      radius: spec.radius,
      speed: spec.speed * (1 + Math.min(s.wave - 1, 20) * 0.035),
      phase: this.random() * 6.28,
      hit: 0,
      attack: 3.5,
    };
    s.enemies.push(enemy);
    return enemy;
  }
  summonBoss() {
    if (this.state.enemies.some((e) => e.kind === 'boss')) return false;
    const e = this.spawn('boss');
    e.x = 225;
    e.y = 180;
    this.burst(e, '#d99fdd', 40);
    this.sound('boss');
    this.emit({ type: 'boss' });
    return true;
  }
  skill(skill: Skill) {
    const s = this.state;
    if (s.status !== 'running' || s.cooldowns[skill] > 0) return false;
    s.cooldowns[skill] = COOLDOWNS[skill];
    if (skill === 'nova') this.nova(170, s.damage * 3);
    if (skill === 'frost') {
      s.freeze = Math.max(s.freeze, 5);
      s.hazards = [];
      s.shots = s.shots.filter((shot) => !shot.hostile);
      this.ring(s.player, '#a2e5ff', 230);
      this.sound('frost');
    }
    if (skill === 'lightning') {
      const targets = [...s.enemies]
        .sort(
          (a, b) =>
            Math.hypot(a.x - s.player.x, a.y - s.player.y) -
            Math.hypot(b.x - s.player.x, b.y - s.player.y),
        )
        .slice(0, 5);
      this.emit({
        type: 'spell',
        effect: 'lightning',
        targets: targets.map((e) => ({ x: e.x, y: e.y })),
      });
      for (const e of targets) {
        this.damageEnemy(e, s.damage * 4);
        this.ring(e, '#ddd0ff', 42);
      }
      this.sound('lightning');
    }
    return true;
  }
  gift(kind: GiftKind) {
    const s = this.state;
    if (s.status !== 'running') return false;
    s.gifts++;
    if (kind === 'rose') {
      s.hp = Math.min(s.maxHp, s.hp + 25);
      this.float(s.player, '+25 HP', '#9ff3bf');
      this.burst(s.player, '#f5a4bd', 25);
    }
    if (kind === 'ice') {
      s.freeze = Math.max(s.freeze, 5);
      this.ring(s.player, '#a2e5ff', 420);
      this.sound('frost');
    }
    if (kind === 'meteor') {
      this.emit({
        type: 'spell',
        effect: 'meteor',
        targets: s.enemies.map((e) => ({ x: e.x, y: e.y })).slice(0, 8),
      });
      this.nova(900, 180);
    }
    if (kind === 'crown') {
      if (!this.summonBoss()) {
        s.hp = Math.min(s.maxHp, s.hp + 25);
        this.float(s.player, 'KING ALREADY PRESENT · +25 HP', '#e5ca80');
      }
    }
    s.score += 50;
    this.sound('gift');
    return true;
  }
  private nova(radius: number, damage: number) {
    const s = this.state;
    this.ring(s.player, '#ffbd76', radius);
    this.burst(s.player, '#ffbd76', 45);
    s.shake = 5;
    for (const e of [...s.enemies])
      if (Math.hypot(e.x - s.player.x, e.y - s.player.y) < radius) this.damageEnemy(e, damage);
    this.sound('nova');
  }
  burst(p: Vec, color: string, count: number) {
    const s = this.state;
    for (let i = 0; i < count && s.particles.length < 220; i++) {
      const a = this.random() * Math.PI * 2,
        speed = 15 + this.random() * 95,
        life = 0.25 + this.random() * 0.6;
      s.particles.push({
        ...p,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life,
        maxLife: life,
        size: 1 + this.random() * 3,
        color,
      });
    }
  }
  private ring(p: Vec, color: string, radius: number) {
    this.state.rings.push({ ...p, color, radius, life: 0.65, maxLife: 0.65 });
  }
  private float(p: Vec, text: string, color: string) {
    if (this.state.texts.length < 30) this.state.texts.push({ ...p, text, color, life: 1 });
  }
  damageEnemy(e: Enemy, damage: number) {
    if (e.hp <= 0) return;
    e.hp -= damage;
    e.hit = 0.15;
    this.float(e, String(Math.round(damage)), '#f6e6b6');
    if (e.hp > 0) {
      this.burst(e, '#c1ebd0', 4);
      return;
    }
    const s = this.state;
    s.kills++;
    s.xp += e.kind === 'boss' ? 100 : 10;
    s.waveKilled++;
    s.score += ENEMIES[e.kind].score;
    s.enemies = s.enemies.filter((enemy) => enemy.id !== e.id);
    this.burst(e, e.kind === 'boss' ? '#eac778' : '#9ad6af', e.kind === 'boss' ? 65 : 14);
    this.sound('kill');
    if (e.kind === 'boss') {
      s.hp = Math.min(s.maxHp, s.hp + 20);
      s.hazards = [];
      s.shots = s.shots.filter((shot) => !shot.hostile);
    }
  }
  hurt(damage: number) {
    const s = this.state;
    if (s.invulnerable > 0 || s.status !== 'running') return;
    s.hp = Math.max(0, s.hp - damage);
    s.invulnerable = 0.8;
    s.shake = 4;
    s.flash = 0.2;
    this.sound('hit');
    this.float(s.player, `−${damage}`, '#ff9696');
    if (!s.hp) {
      s.status = 'gameover';
      s.best = Math.max(s.best, s.score);
      this.sound('defeat');
      this.emit({ type: 'defeat', score: s.score });
    }
  }
  update(dt: number) {
    const s = this.state;
    if (s.status !== 'running' || dt <= 0 || !Number.isFinite(dt)) return;
    dt = Math.min(dt, 0.05);
    s.time += dt;
    s.freeze = Math.max(0, s.freeze - dt);
    s.invulnerable = Math.max(0, s.invulnerable - dt);
    s.shake = Math.max(0, s.shake - dt * 15);
    s.flash = Math.max(0, s.flash - dt);
    for (const key of Object.keys(s.cooldowns) as Skill[])
      s.cooldowns[key] = Math.max(0, s.cooldowns[key] - dt);
    s.spawnTimer -= dt;
    if (s.spawnRemaining > 0 && s.spawnTimer <= 0 && s.enemies.length < 65) {
      this.spawn();
      s.spawnRemaining--;
      s.spawnTimer = Math.max(0.3, 1.1 - s.wave * 0.035);
    }
    s.shootTimer -= dt;
    if (s.shootTimer <= 0 && s.enemies.length) {
      const target = s.enemies.reduce((a, b) =>
        Math.hypot(a.x - s.player.x, a.y - s.player.y) <
        Math.hypot(b.x - s.player.x, b.y - s.player.y)
          ? a
          : b,
      );
      const angle = Math.atan2(target.y - s.player.y, target.x - s.player.x);
      s.shots.push({
        ...s.player,
        vx: Math.cos(angle) * 310,
        vy: Math.sin(angle) * 310,
        life: 2.5,
        damage: s.damage,
        hostile: false,
      });
      s.shootTimer = s.fireRate;
      this.sound('shot');
    }
    for (const e of s.enemies) {
      e.hit = Math.max(0, e.hit - dt);
      if (s.freeze > 0) continue;
      const angle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
      const distance = Math.hypot(e.x - s.player.x, e.y - s.player.y);
      if (distance > e.radius + 12) {
        e.x += Math.cos(angle) * e.speed * dt;
        e.y += Math.sin(angle) * e.speed * dt;
      } else if (!this.externalCollisions) this.hurt(e.kind === 'boss' ? 22 : 10);
      if (e.kind === 'boss') {
        e.attack -= dt;
        if (e.attack <= 0) {
          e.attack = e.hp < e.maxHp / 2 ? 2.4 : 3.6;
          s.hazards.push({ ...s.player, radius: e.hp < e.maxHp / 2 ? 62 : 48, remaining: 1.2 });
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4 + s.time;
            s.shots.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 85,
              vy: Math.sin(a) * 85,
              hostile: true,
              damage: 14,
              life: 6,
            });
          }
        }
      }
    }
    for (const shot of s.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (this.externalCollisions) continue;
      if (shot.hostile) {
        if (Math.hypot(shot.x - s.player.x, shot.y - s.player.y) < 17) {
          this.hurt(shot.damage);
          shot.life = 0;
        }
      } else {
        const e = s.enemies.find(
          (enemy) => Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < enemy.radius + 7,
        );
        if (e) {
          this.damageEnemy(e, shot.damage);
          shot.life = 0;
        }
      }
    }
    s.shots = s.shots.filter((shot) => shot.life > 0);
    for (const hazard of s.hazards) {
      hazard.remaining -= dt;
      if (hazard.remaining <= 0) {
        if (Math.hypot(hazard.x - s.player.x, hazard.y - s.player.y) < hazard.radius + 10)
          this.hurt(25);
        this.ring(hazard, '#d77ba3', hazard.radius);
        this.burst(hazard, '#c987d2', 18);
      }
    }
    s.hazards = s.hazards.filter((hazard) => hazard.remaining > 0);
    for (const p of s.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);
    for (const r of s.rings) r.life -= dt;
    s.rings = s.rings.filter((r) => r.life > 0);
    for (const t of s.texts) {
      t.y -= dt * 26;
      t.life -= dt;
    }
    s.texts = s.texts.filter((t) => t.life > 0);
    if (s.spawnRemaining === 0 && s.enemies.length === 0 && s.status === 'running') {
      s.waveBreak += dt;
      if (s.waveBreak >= 1.2) {
        s.status = 'upgrade';
        s.shots = [];
        s.hazards = [];
        this.sound('wave');
      }
    }
  }
}
