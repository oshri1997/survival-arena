import Phaser from 'phaser';
import {
  hasTeamPower,
  WORLD,
  type BattleEffect,
  type BattleSnapshot,
  type Fighter,
  type Team,
} from './contracts';
import type { BattleFeed } from './Client';
import { avatar } from './avatars';
import { Sound } from '../audio/Sound';
import { confine, frontierX } from './territory';
import { smoothPosition } from './motion';
const color = (team: Team) => (team === 'red' ? 0xff5770 : 0x43baff);
interface Actor {
  image: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  health: Phaser.GameObjects.Graphics;
  level: Phaser.GameObjects.Text;
  model: Fighter;
  x: number;
  y: number;
  phase: number;
  recoil: number;
  impact: number;
  lastTeam: Team;
  wasAlive: boolean;
  healthFraction: number;
}
export class TeamScene extends Phaser.Scene {
  private board!: Phaser.GameObjects.Graphics;
  private shots!: Phaser.GameObjects.Graphics;
  private actors = new Map<string, Actor>();
  private effects: (BattleEffect & { life: number })[] = [];
  private lastEffect = 0;
  private firstSnapshot = true;
  private territory = 0.5;
  private radius = 22;
  private boardKey = '';
  private motionTime = 0;
  private snapshotTime = 0;
  private unsubscribe?: () => void;
  constructor(
    private client: BattleFeed,
    private fxSound: Sound,
  ) {
    super('Teams');
  }
  create() {
    this.cameras.main.setBackgroundColor('#11172b');
    this.board = this.add.graphics().setDepth(0);
    this.shots = this.add.graphics().setDepth(50);
    this.unsubscribe = this.client.onState((state) => this.snapshot(state));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }
  private snapshot(state: BattleSnapshot) {
    this.snapshotTime = performance.now();
    if (state.live === 'waiting') this.effects = [];
    if (this.firstSnapshot) {
      this.lastEffect = state.sequence;
      this.firstSnapshot = false;
    }
    const fresh = state.effects.filter((effect) => effect.id > this.lastEffect);
    for (const effect of fresh) {
      const actor = effect.fighterId ? this.actors.get(effect.fighterId) : undefined;
      if (actor && effect.type === 'shot') actor.recoil = 1;
      if (actor && effect.type === 'hit') actor.impact = 1;
    }
    if (fresh.some((e) => e.type === 'meteor')) this.fxSound.play('nova');
    else if (fresh.some((e) => e.type === 'bolt')) this.fxSound.play('lightning');
    else if (fresh.some((e) => e.type === 'frost')) this.fxSound.play('frost');
    else if (fresh.some((e) => e.type === 'boost' || e.type === 'shield' || e.type === 'gift'))
      this.fxSound.play('gift');
    else if (fresh.some((e) => e.type === 'rally')) this.fxSound.play('wave');
    else if (fresh.some((e) => e.type === 'shot')) this.fxSound.play('shot');
    for (const effect of state.effects)
      if (effect.id > this.lastEffect)
        this.effects.push({
          ...effect,
          life:
            effect.type === 'meteor' ||
            effect.type === 'rally' ||
            effect.type === 'gift' ||
            effect.type === 'frost'
              ? 0.8
              : 0.35,
        });
    this.lastEffect = state.sequence;
    this.effects = this.effects.slice(-100);
    const fighterIds = new Set(state.fighters.map((fighter) => fighter.id));
    for (const [id, actor] of this.actors)
      if (!fighterIds.has(id)) {
        actor.image.destroy();
        actor.ring.destroy();
        actor.label.destroy();
        actor.health.destroy();
        actor.level.destroy();
        this.actors.delete(id);
      }
    for (const fighter of state.fighters) {
      let actor = this.actors.get(fighter.id);
      if (!actor) {
        const image = this.add
          .image(this.mapX(fighter.x), this.mapY(fighter.y), avatar(this, fighter))
          .setDepth(20);
        const ring = this.add
          .circle(image.x, image.y, 22)
          .setStrokeStyle(3, color(fighter.team))
          .setDepth(21);
        const label = this.add
          .text(image.x, image.y, fighter.name, {
            fontFamily: 'Arial',
            fontStyle: 'bold',
            fontSize: '10px',
            color: '#e8f6ff',
            stroke: '#101b35',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(25);
        const level = this.add
          .text(image.x, image.y, '', {
            fontSize: '10px',
            color: '#ffe9a4',
            stroke: '#192438',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(26);
        actor = {
          image,
          ring,
          label,
          level,
          health: this.add.graphics().setDepth(24),
          model: fighter,
          x: fighter.x,
          y: fighter.y,
          phase: this.actors.size * 2.39996,
          recoil: 0,
          impact: 0,
          lastTeam: fighter.team,
          wasAlive: fighter.hp > 0,
          healthFraction: fighter.hp / fighter.maxHp,
        };
        this.actors.set(fighter.id, actor);
      }
      if (actor.lastTeam !== fighter.team || (!actor.wasAlive && fighter.hp > 0)) {
        actor.x = fighter.x;
        actor.y = fighter.y;
        actor.healthFraction = fighter.hp / fighter.maxHp;
      }
      actor.lastTeam = fighter.team;
      actor.wasAlive = fighter.hp > 0;
      actor.model = fighter;
      actor.label.setText(fighter.name.slice(0, 14));
      const stars = '★'.repeat(fighter.level - 1);
      const power = fighter.likePower ? `+${fighter.likePower}` : '';
      const tier = (fighter.likeTier ?? 0) > 3 ? `P${fighter.likeTier}` : '';
      actor.level.setText([stars, power, tier].filter(Boolean).join(' '));
      actor.ring.setStrokeStyle(fighter.level >= 3 ? 4 : 3, color(fighter.team));
    }
  }
  private mapX(x: number) {
    return (x / WORLD.width) * this.scale.width;
  }
  private mapY(y: number) {
    return (y / WORLD.height) * this.scale.height;
  }
  update(_time: number, delta: number) {
    const state = this.client.state;
    if (!state || !this.board) return;
    const dt = Math.min(delta / 1000, 0.1),
      width = this.scale.width,
      height = this.scale.height;
    this.radius = Phaser.Math.Clamp(
      Math.min(width / WORLD.width, height / WORLD.height) * 23,
      16,
      60,
    );
    this.territory = Phaser.Math.Linear(this.territory, state.territory, Math.min(1, dt * 5));
    const moving = !state.paused && state.phase === 'battle' && state.live !== 'waiting';
    const snapshotAge = moving ? (performance.now() - this.snapshotTime) / 1000 : 0;
    if (moving) this.motionTime += dt;
    const boardKey = `${width}:${height}:${Math.round((this.territory * width) / 2)}:${state.round}`;
    if (this.boardKey !== boardKey) {
      this.drawBoard(width, height);
      this.boardKey = boardKey;
    }
    for (const actor of this.actors.values()) {
      const f = actor.model,
        visible = f.hp > 0;
      actor.image.setVisible(visible);
      actor.ring.setVisible(visible);
      actor.label.setVisible(visible);
      actor.level.setVisible(visible);
      actor.health.clear();
      if (!visible) {
        actor.recoil = actor.impact = 0;
        continue;
      }
      const position = confine(
        smoothPosition(actor, f, dt, snapshotAge),
        f.team,
        this.territory,
        state.round,
      );
      actor.x = position.x;
      actor.y = position.y;
      const front = frontierX(position.y, this.territory, state.round);
      const clearance =
        Math.min(
          f.team === 'red' ? position.x - 8 : WORLD.width - 8 - position.x,
          Math.abs(position.x - front),
        ) - 5;
      const radius = Math.min(this.radius + (f.level - 1) * 2, this.mapX(Math.max(7, clearance)));
      const speed = moving ? Math.min(1, Math.hypot(f.vx ?? 0, f.vy ?? 0) / 42) : 0;
      const x = this.mapX(position.x),
        y =
          this.mapY(position.y) +
          Math.sin(this.motionTime * 5 + actor.phase) * speed * this.radius * 0.045;
      actor.recoil = Math.max(0, actor.recoil - dt * 7);
      actor.impact = Math.max(0, actor.impact - dt * 5);
      const pulse = 1 - actor.recoil * 0.06 + actor.impact * 0.055;
      actor.image
        .setPosition(x, y)
        .setDisplaySize((radius * 2 - 5) * pulse, (radius * 2 - 5) * pulse);
      actor.image.setRotation(
        Phaser.Math.Linear(
          actor.image.rotation,
          moving ? ((f.vx ?? 0) / 42) * 0.055 : 0,
          1 - Math.exp(-dt * 8),
        ),
      );
      actor.image.setTint(actor.impact > 0.3 ? 0xffd7cb : 0xffffff);
      actor.ring.setPosition(x, y).setRadius(radius).setFillStyle(color(f.team), 0.12);
      actor.label.setPosition(x, y + radius + 11);
      const fontSize = Math.round(this.radius * 0.45);
      if (actor.label.style.fontSize !== `${fontSize}px`) actor.label.setFontSize(fontSize);
      actor.level.setPosition(x, y - radius - 15);
      if (actor.level.style.fontSize !== `${fontSize}px`) actor.level.setFontSize(fontSize);
      const h = actor.health;
      h.fillStyle(0x071b26, 0.9);
      h.fillRoundedRect(x - radius * 0.7, y - radius - 6, radius * 1.4, 4, 2);
      h.fillStyle(0x8ee3b4, 1);
      actor.healthFraction = Phaser.Math.Linear(
        actor.healthFraction,
        f.hp / f.maxHp,
        1 - Math.exp(-dt * 12),
      );
      h.fillRoundedRect(
        x - radius * 0.7,
        y - radius - 6,
        radius * 1.4 * actor.healthFraction,
        4,
        2,
      );
      if (state.shields[f.team] > 0) {
        h.lineStyle(2, 0xc8faff, 0.65);
        h.strokeCircle(x, y, radius + 5);
      }
      if ((state.frost?.[f.team] ?? 0) > 0) {
        h.lineStyle(2, 0x8adeff, 0.85);
        h.strokeCircle(x, y, radius + 7);
      }
      actor.ring.setStrokeStyle(f.level >= 3 ? 4 : 3, color(f.team));
      if (state.phase === 'battle' && (f.likePower || hasTeamPower(state, f.team))) {
        h.lineStyle(3, 0xffe38b, 0.95);
        h.strokeCircle(x, y, radius + 3);
      }
    }
    this.drawEffects(dt);
  }
  private drawBoard(width: number, height: number) {
    const g = this.board;
    g.clear();
    const size = Phaser.Math.Clamp(
        Math.min(width / WORLD.width, height / WORLD.height) * 28,
        22,
        65,
      ),
      dx = Math.sqrt(3) * size,
      dy = 1.5 * size;
    for (let row = -1; row < height / dy + 1; row++)
      for (let col = -1; col < width / dx + 1; col++) {
        const x = col * dx + ((row % 2) * dx) / 2,
          y = row * dy;
        const line = this.mapX(
          frontierX((y / height) * WORLD.height, this.territory, this.client.state!.round),
        );
        const red = x < line;
        const points: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 - Math.PI / 2;
          points.push(
            new Phaser.Math.Vector2(
              x + Math.cos(angle) * (size - 1),
              y + Math.sin(angle) * (size - 1),
            ),
          );
        }
        g.fillStyle(
          red ? ((row + col) % 3 ? 0x631c38 : 0x6d213e) : (row + col) % 3 ? 0x123b67 : 0x184771,
          1,
        );
        g.fillPoints(points, true);
        g.lineStyle(1, red ? 0xa43b52 : 0x3576a0, 0.35);
        g.strokePoints(points, true, true);
      }
    const border: Phaser.Math.Vector2[] = [];
    for (let y = 0; y <= height + 10; y += 12)
      border.push(
        new Phaser.Math.Vector2(
          this.mapX(
            frontierX((y / height) * WORLD.height, this.territory, this.client.state!.round),
          ),
          y,
        ),
      );
    g.lineStyle(8, 0xffffff, 0.035).strokePoints(border);
    g.lineStyle(2, 0xb3d7fb, 0.34).strokePoints(border);
  }
  private drawEffects(dt: number) {
    const g = this.shots;
    g.clear();
    for (const e of this.effects) {
      e.life -= dt;
      if (e.life <= 0) continue;
      const x = this.mapX(e.x),
        y = this.mapY(e.y),
        tint = e.team ? color(e.team) : 0xffdb87,
        alpha = Math.min(1, e.life * 4);
      if (e.type === 'shot') {
        const tx = this.mapX(e.targetX!),
          ty = this.mapY(e.targetY!);
        const t = 1 - e.life / 0.35,
          tail = Math.max(0, t - (e.powered ? 0.32 : 0.2)),
          headX = Phaser.Math.Linear(x, tx, t),
          headY = Phaser.Math.Linear(y, ty, t);
        g.lineStyle(e.powered ? 5 : 3, tint, alpha);
        g.lineBetween(
          Phaser.Math.Linear(x, tx, tail),
          Phaser.Math.Linear(y, ty, tail),
          headX,
          headY,
        );
        if (e.powered) {
          g.fillStyle(0xffe38b, alpha);
          g.fillCircle(headX, headY, 3.5);
        }
      } else if (e.type === 'meteor') {
        const t = 1 - e.life / 0.8,
          radius = (15 + t * 140) * Math.min(this.scale.width / 480, 1.3);
        {
          g.fillStyle(0xffbc6e, alpha * 0.2);
          g.fillCircle(x, y, radius);
          g.lineStyle(5, 0xffd69b, alpha);
          g.strokeCircle(x, y, radius);
          for (let i = 0; i < 12; i++) {
            const angle = (i * Math.PI) / 6;
            g.lineStyle(3, 0xffe0af, alpha);
            g.lineBetween(
              x + Math.cos(angle) * radius * 0.6,
              y + Math.sin(angle) * radius * 0.6,
              x + Math.cos(angle) * radius,
              y + Math.sin(angle) * radius,
            );
          }
        }
      } else if (e.type === 'bolt') {
        g.lineStyle(7, 0x759cff, alpha * 0.45);
        g.lineBetween(x - 9, y - 68, x, y);
        g.lineStyle(3, 0xf6f2ff, alpha);
        g.beginPath();
        g.moveTo(x + 12, y - 82);
        g.lineTo(x - 10, y - 53);
        g.lineTo(x + 7, y - 48);
        g.lineTo(x - 5, y - 20);
        g.lineTo(x, y);
        g.strokePath();
      } else if (e.type === 'rally' || e.type === 'gift' || e.type === 'frost') {
        const gift = e.type === 'gift';
        const frost = e.type === 'frost';
        const progress = 1 - e.life / 0.8;
        const radius = this.radius + progress * this.radius * (gift ? 3 : 5);
        const glow = gift ? 0xffdb87 : frost ? 0x89dfff : tint;
        g.fillStyle(glow, alpha * 0.1);
        g.fillCircle(x, y, radius);
        g.lineStyle(3, glow, alpha);
        g.strokeCircle(x, y, radius);
        g.lineStyle(1, glow, alpha * 0.7);
        g.strokeCircle(x, y, radius * 0.78);
        g.fillStyle(gift ? 0xfff0c1 : frost ? 0xe4f9ff : 0xb9ffe1, alpha);
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI) / 5 + progress * 0.3;
          g.fillCircle(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 2 + (i % 2));
        }
      } else {
        const radius =
          e.type === 'shield' || e.type === 'boost' ? 60 : e.type === 'defeat' ? 24 : 10;
        g.lineStyle(e.type === 'hit' ? 3 : 2, e.type === 'hit' ? 0xfff4c2 : tint, alpha);
        g.strokeCircle(x, y, radius * (1.5 - e.life));
        if (e.type === 'defeat')
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            g.fillStyle(tint, alpha);
            g.fillRect(
              x + Math.cos(angle) * radius * (2 - e.life * 3),
              y + Math.sin(angle) * radius * (2 - e.life * 3),
              4,
              4,
            );
          }
      }
    }
    this.effects = this.effects.filter((e) => e.life > 0);
  }
}
