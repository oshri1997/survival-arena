import { COOLDOWNS, CRYSTAL_RADIUS, ENEMIES, METEOR_FLIGHT, waveCount } from './config';
import type {
  Enemy,
  EnemyKind,
  GameEvent,
  GameState,
  GiftKind,
  GiftResult,
  Skill,
  Upgrade,
  Vec,
} from './types';

/** Pure simulation: seconds, logical portrait coordinates, no browser or rendering dependencies. */
export class Game {
  state: GameState;
  bounds = { width: 450, height: 800 };
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
      player: { x: this.bounds.width / 2, y: this.bounds.height * 0.5125 },
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
      meteor: 0,
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
  setBounds(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) return;
    const sx = width / this.bounds.width,
      sy = height / this.bounds.height;
    for (const p of [
      this.state.player,
      ...this.state.enemies,
      ...this.state.shots,
      ...this.state.particles,
      ...this.state.rings,
      ...this.state.texts,
    ]) {
      p.x *= sx;
      p.y *= sy;
    }
    this.bounds = { width, height };
  }
  start(quickStart = false) {
    this.state = this.initial(this.state.best);
    this.state.status = 'running';
    if (quickStart) {
      for (let i = 0; i < 6; i++) {
        const e = this.spawn(i === 2 || i === 4 ? 'skeleton' : 'imp');
        const angle = (i * Math.PI) / 3 + 0.4;
        e.x = this.state.player.x + Math.cos(angle) * Math.min(320, this.bounds.width * 0.35);
        e.y = this.state.player.y + Math.sin(angle) * 180;
        this.emit({ type: 'spawn', at: { x: e.x, y: e.y }, kind: e.kind });
        this.state.spawnRemaining--;
      }
    }
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
    const x =
      side === 0
        ? 25
        : side === 1
          ? this.bounds.width - 25
          : 45 + this.random() * (this.bounds.width - 90);
    const y =
      side === 2
        ? 95
        : side === 3
          ? this.bounds.height - 105
          : 110 + this.random() * (this.bounds.height - 220);
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
      windup: 0,
      windupDuration: 0,
      enraged: false,
    };
    s.enemies.push(enemy);
    return enemy;
  }
  summonBoss(viewerName?: string) {
    if (this.state.enemies.some((e) => e.kind === 'boss')) return false;
    const e = this.spawn('boss');
    e.x = this.bounds.width / 2;
    e.y = 145;
    e.viewerName = viewerName;
    this.emit({ type: 'spawn', at: { x: e.x, y: e.y }, kind: e.kind });
    this.burst(e, '#d99fdd', 40);
    this.sound('boss');
    this.emit({ type: 'boss' });
    return true;
  }
  skill(skill: Skill) {
    const s = this.state;
    if (s.status !== 'running' || s.cooldowns[skill] > 0 || !s.enemies.length) return false;
    s.cooldowns[skill] = COOLDOWNS[skill];
    if (skill === 'nova') this.nova(170, s.damage * 3);
    if (skill === 'frost') this.freezeArena();
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
  private freezeArena() {
    const s = this.state;
    const chargingBoss = s.enemies.find((e) => e.kind === 'boss' && e.windup > 0);
    s.freeze = Math.max(s.freeze, 5);
    s.shots = s.shots.filter((shot) => !shot.hostile);
    this.ring(s.player, '#a2e5ff', 230);
    this.emit({ type: 'spell', effect: 'frost', targets: [] });
    this.sound('frost');
    if (chargingBoss) {
      chargingBoss.windup = 0;
      chargingBoss.attack = 2.5;
      this.emit({ type: 'boss-interrupted', at: { x: chargingBoss.x, y: chargingBoss.y } });
      this.damageEnemy(chargingBoss, s.damage * 2);
    }
    return !!chargingBoss;
  }
  heal(amount: number) {
    const s = this.state;
    const healed = Math.min(amount, s.maxHp - s.hp);
    s.hp += healed;
    if (healed > 0) this.float(s.player, `+${healed} HP`, '#baffac');
    this.emit({ type: 'heal', at: { ...s.player }, amount: healed });
    return healed;
  }
  gift(kind: GiftKind, viewerName?: string): GiftResult | false {
    const s = this.state;
    if (s.status !== 'running' || (kind === 'meteor' && s.meteor > 0)) return false;
    s.gifts++;
    s.score += 50;
    this.sound('gift');
    if (kind === 'rose') return { kind, healed: this.heal(25) };
    if (kind === 'ice') return { kind, interrupted: this.freezeArena() };
    if (kind === 'meteor') {
      s.meteor = METEOR_FLIGHT;
      return { kind };
    }
    if (this.summonBoss(viewerName)) return { kind: 'crown' };
    return { kind: 'crown-support', healed: this.heal(25) };
  }
  private nova(radius: number, damage: number) {
    const s = this.state;
    this.emit({ type: 'spell', effect: 'nova', targets: [] });
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
    this.emit({ type: 'impact', id: e.id, at: { x: e.x, y: e.y }, lethal: e.hp <= 0 });
    e.hit = 0.15;
    this.float(e, String(Math.round(damage)), '#f6e6b6');
    if (e.hp > 0) {
      if (e.kind === 'boss' && !e.enraged && e.hp <= e.maxHp / 2) {
        e.enraged = true;
        this.emit({ type: 'boss-phase', at: { x: e.x, y: e.y } });
      }
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
      this.heal(20);
      s.shots = s.shots.filter((shot) => !shot.hostile);
      this.emit({ type: 'boss-defeated', at: { x: e.x, y: e.y } });
    }
  }
  hurt(damage: number, attackerId?: number) {
    const s = this.state;
    if (s.invulnerable > 0 || s.status !== 'running') return;
    s.hp = Math.max(0, s.hp - damage);
    s.invulnerable = 0.8;
    s.shake = 4;
    s.flash = 0.2;
    this.sound('hit');
    this.emit({ type: 'crystal-hit', attackerId });
    this.float(s.player, `−${damage}`, '#ff9696');
    if (!s.hp) {
      s.status = 'gameover';
      s.meteor = 0;
      s.best = Math.max(s.best, s.score);
      this.sound('defeat');
      this.emit({ type: 'defeat', score: s.score });
    }
  }
  private updateBoss(boss: Enemy, dt: number) {
    const s = this.state;
    if (boss.windup > 0) {
      boss.windup = Math.max(0, boss.windup - dt);
      if (boss.windup > 0) return;
      this.hurt(boss.enraged ? 19 : 13, boss.id);
      this.emit({ type: 'boss-strike', at: { ...s.player } });
      const count = boss.enraged ? 8 : 5;
      for (let i = 0; i < count; i++) {
        const angle = (i * 2 * Math.PI) / count + s.time;
        s.shots.push({
          x: boss.x,
          y: boss.y,
          vx: Math.cos(angle) * 100,
          vy: Math.sin(angle) * 100,
          hostile: true,
          damage: 8,
          life: 3,
        });
      }
      return;
    }
    boss.attack -= dt;
    if (boss.attack <= 0) {
      boss.windupDuration = boss.enraged ? 1.15 : 1.6;
      boss.windup = boss.windupDuration;
      boss.attack = boss.enraged ? 2.7 : 3.7;
    }
  }
  update(dt: number, externalCollisions = this.externalCollisions) {
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
    if (s.meteor > 0) {
      s.meteor = Math.max(0, s.meteor - dt);
      if (s.meteor === 0) {
        this.emit({ type: 'meteor-landed', at: { ...s.player } });
        this.ring(s.player, '#ffaf43', 300);
        this.burst(s.player, '#ffd36e', 50);
        for (const enemy of [...s.enemies]) this.damageEnemy(enemy, 180);
        this.sound('nova');
      }
    }
    s.spawnTimer -= dt;
    if (s.spawnRemaining > 0 && s.spawnTimer <= 0 && s.enemies.length < 65) {
      const e = this.spawn();
      this.emit({ type: 'spawn', at: { x: e.x, y: e.y }, kind: e.kind });
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
      const origin = { x: s.player.x + 91, y: s.player.y + 11 };
      const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
      s.shots.push({
        ...origin,
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
      if (distance > e.radius + CRYSTAL_RADIUS - 2 && e.windup === 0) {
        e.x += Math.cos(angle) * e.speed * dt;
        e.y += Math.sin(angle) * e.speed * dt;
      } else if (!externalCollisions && distance <= e.radius + CRYSTAL_RADIUS && e.windup === 0) {
        this.hurt(e.kind === 'boss' ? 17 : 10, e.id);
      }
      if (e.kind === 'boss') this.updateBoss(e, dt);
    }
    for (const shot of s.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (externalCollisions) continue;
      if (shot.hostile) {
        if (Math.hypot(shot.x - s.player.x, shot.y - s.player.y) < CRYSTAL_RADIUS + 5) {
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
    if (s.spawnRemaining === 0 && s.enemies.length === 0 && !s.meteor && s.status === 'running') {
      s.waveBreak += dt;
      if (s.waveBreak >= 1.2) {
        s.status = 'upgrade';
        s.shots = [];
        this.sound('wave');
      }
    }
  }
}
