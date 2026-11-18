import Phaser from 'phaser';
import type { GameState, Particle, Vec } from '../types';
import { METEOR_FLIGHT } from '../config';
export class Effects {
  private seen = new WeakSet<Particle>();
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private graphics: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private bossLabel: Phaser.GameObjects.Text;
  private fallingMeteor: Phaser.GameObjects.Image;
  constructor(
    private scene: Phaser.Scene,
    private origin: () => Vec,
  ) {
    this.bossLabel = scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#fff0c2',
        stroke: '#302144',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(980)
      .setVisible(false);
    this.graphics = scene.add.graphics().setDepth(950);
    this.fallingMeteor = scene.add.image(0, 0, 'fireball').setDepth(970).setVisible(false);
    this.emitter = scene.add
      .particles(0, 0, 'spark', {
        emitting: false,
        lifespan: { min: 250, max: 650 },
        speed: { min: 30, max: 150 },
        scale: { start: 0.48, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
        maxParticles: 280,
      })
      .setDepth(920);
    for (let i = 0; i < 30; i++)
      this.labels.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: 'Arial',
            fontSize: '19px',
            fontStyle: 'bold',
            stroke: '#3b3327',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(980)
          .setVisible(false),
      );
  }
  update(s: GameState) {
    const boss = s.enemies.find((e) => e.kind === 'boss');
    this.bossLabel.setVisible(!!boss);
    if (boss)
      this.bossLabel
        .setText(boss.viewerName ? `${boss.viewerName} · BOSS` : 'BOSS')
        .setPosition(boss.x, Math.max(72, boss.y - 129));
    const g = this.graphics;
    g.clear();
    for (const p of s.particles)
      if (!this.seen.has(p)) {
        this.seen.add(p);
        this.emitter.setParticleTint(Phaser.Display.Color.HexStringToColor(p.color).color);
        this.emitter.emitParticleAt(p.x, p.y, 1);
      }
    for (const shot of s.shots) {
      g.lineStyle(shot.hostile ? 5 : 4, shot.hostile ? 0xe0adff : 0x9ffff5, 0.7);
      g.lineBetween(shot.x, shot.y, shot.x - shot.vx * 0.08, shot.y - shot.vy * 0.08);
    }
    for (const r of s.rings) {
      const progress = 1 - r.life / r.maxLife;
      g.lineStyle(
        8 * (1 - progress) + 1,
        Phaser.Display.Color.HexStringToColor(r.color).color,
        (1 - progress) * 0.95,
      );
      g.strokeEllipse(r.x, r.y, r.radius * progress * 2, r.radius * progress * 1.3);
      g.lineStyle(2, 0xffffff, (1 - progress) * 0.6);
      g.strokeEllipse(r.x, r.y, r.radius * progress * 1.7, r.radius * progress * 1.1);
    }
    if (boss && boss.windup > 0) this.bossWarning(boss, s.player);
    this.drawMeteor(s);
    for (const e of s.enemies) {
      if (s.freeze > 0) {
        g.fillStyle(0xaffbff, 0.25);
        g.fillEllipse(e.x, e.y, 70, 36);
        g.lineStyle(2, 0xc4ffff, 0.9);
        g.strokeEllipse(e.x, e.y, 70, 36);
        g.fillStyle(0xb9f9ff, 0.65);
        g.fillTriangle(e.x - 27, e.y, e.x - 17, e.y - 39, e.x - 7, e.y);
        g.fillTriangle(e.x + 8, e.y + 5, e.x + 24, e.y - 30, e.x + 31, e.y + 5);
      }
      if (e.kind === 'boss') {
        const y = Math.max(85, e.y - 117);
        g.fillStyle(0x261332, 0.95);
        g.fillRoundedRect(e.x - 58, y, 116, 10, 5);
        g.fillStyle(e.enraged ? 0xff517c : 0xe6a6ff, 1);
        const width = 110 * Math.max(0, e.hp / e.maxHp);
        if (width >= 2) g.fillRoundedRect(e.x - 55, y + 2, width, 6, 3);
      }
    }
    this.labels.forEach((label, i) => {
      const t = s.texts[i];
      label.setVisible(!!t);
      if (t)
        label
          .setPosition(t.x, t.y - 56)
          .setText(t.text)
          .setColor(t.color)
          .setAlpha(Math.min(1, t.life * 2));
    });
  }
  private bossWarning(boss: Vec & { windup: number; windupDuration: number }, crystal: Vec) {
    const g = this.graphics;
    const progress = 1 - boss.windup / boss.windupDuration;
    g.fillStyle(0xf12260, 0.12 + 0.27 * progress);
    g.fillEllipse(crystal.x, crystal.y + 15, 193, 109);
    g.lineStyle(5, 0xff6089, 0.96);
    g.strokeEllipse(crystal.x, crystal.y + 15, 193, 109);
    g.lineStyle(3, 0xffeef0, 0.9);
    g.strokeEllipse(crystal.x, crystal.y + 15, 184 * (1 - progress), 100 * (1 - progress));
    g.lineStyle(14, 0x96174d, 0.35);
    g.lineBetween(boss.x, boss.y - 36, crystal.x, crystal.y - 30);
    g.lineStyle(2 + progress * 4, 0xffb0d0, 0.8);
    g.lineBetween(boss.x, boss.y - 36, crystal.x, crystal.y - 30);
    g.fillStyle(0xff6589, 0.95);
    g.fillCircle(boss.x, boss.y - 36, 6 + 11 * progress);
  }
  private drawMeteor(s: GameState) {
    this.fallingMeteor.setVisible(s.meteor > 0);
    if (s.meteor <= 0) return;
    const t = (1 - s.meteor / METEOR_FLIGHT) ** 2;
    const { x, y } = s.player;
    const dx = Math.min(185, x - 30);
    const g = this.graphics;
    g.fillStyle(0xffa13a, 0.12 + t * 0.26);
    g.fillEllipse(x, y + 10, 170, 105);
    g.lineStyle(3, 0xffd592, 0.8);
    g.strokeEllipse(x, y + 10, 170, 105);
    const mx = x - dx * (1 - t);
    const my = y - 430 * (1 - t);
    g.lineStyle(15, 0xff7939, 0.37);
    g.lineBetween(mx, my, mx - dx * 0.32, my - 137);
    this.fallingMeteor
      .setPosition(mx, my)
      .setScale(1.4 + t * 0.5)
      .setRotation(-Math.atan2(dx, 430));
  }
  pulse(at: Vec, color: number, radius: number, duration: number) {
    const glow = this.scene.add
      .image(at.x, at.y - 20, 'spark')
      .setTint(color)
      .setBlendMode('ADD')
      .setDepth(939)
      .setAlpha(0.67)
      .setDisplaySize(radius, radius * 0.75);
    const rim = this.scene.add
      .ellipse(at.x, at.y, radius * 0.24, radius * 0.14)
      .setStrokeStyle(4, color, 0.97)
      .setDepth(938);
    this.scene.tweens.add({
      targets: [glow, rim],
      alpha: 0,
      duration,
      onComplete: () => {
        glow.destroy();
        rim.destroy();
      },
    });
    this.scene.tweens.add({ targets: rim, scale: 3.8, duration, ease: 'Cubic.easeOut' });
  }
  spawn(at: Vec, boss: boolean) {
    const portal = this.scene.add
      .ellipse(at.x, at.y, boss ? 120 : 62, boss ? 64 : 32, boss ? 0x533080 : 0x442650, 0.68)
      .setStrokeStyle(boss ? 4 : 2, boss ? 0xe4a3ff : 0xc67ce5, 0.9)
      .setDepth(8)
      .setScale(0.25);
    this.scene.tweens.add({
      targets: portal,
      alpha: 0,
      scale: 1.5,
      duration: boss ? 1000 : 450,
      ease: 'Cubic.easeOut',
      onComplete: () => portal.destroy(),
    });
  }
  bossStrike(at: Vec) {
    this.pulse(at, 0xff5881, 250, 440);
    const slash = this.scene.add
      .image(at.x, at.y - 26, 'impact')
      .setDepth(965)
      .setTint(0xff517c)
      .setScale(0.7);
    this.scene.tweens.add({
      targets: slash,
      scale: 2.7,
      alpha: 0,
      angle: 35,
      duration: 320,
      onComplete: () => slash.destroy(),
    });
    this.emitter.setParticleTint(0xff729f);
    this.emitter.explode(26, at.x, at.y);
  }
  impact(at: Vec, lethal: boolean) {
    const star = this.scene.add
      .image(at.x, at.y - 18, 'impact')
      .setScale(lethal ? 0.75 : 0.35)
      .setDepth(960)
      .setAlpha(0.95);
    this.scene.tweens.add({
      targets: star,
      scaleX: lethal ? 1.3 : 0.65,
      scaleY: lethal ? 1.3 : 0.65,
      alpha: 0,
      angle: 35,
      duration: lethal ? 260 : 150,
      onComplete: () => star.destroy(),
    });
  }
  nova(at: Vec) {
    const ring = this.scene.add.graphics().setDepth(940);
    ring.lineStyle(12, 0xffae4e, 0.7);
    ring.strokeEllipse(0, 0, 60, 40);
    ring.lineStyle(3, 0xfff9d6, 1);
    ring.strokeEllipse(0, 0, 52, 34);
    ring.setPosition(at.x, at.y);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 6,
      scaleY: 6,
      alpha: 0,
      duration: 550,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI) / 7,
        fire = this.scene.add
          .image(at.x, at.y, 'fireball')
          .setScale(0.55)
          .setRotation(a + Math.PI / 2)
          .setDepth(930);
      this.scene.tweens.add({
        targets: fire,
        x: at.x + Math.cos(a) * 185,
        y: at.y + Math.sin(a) * 130,
        scaleX: 0.15,
        scaleY: 0.15,
        alpha: 0,
        duration: 550,
        ease: 'Cubic.easeOut',
        onComplete: () => fire.destroy(),
      });
    }
  }
  frost(at: Vec) {
    const g = this.scene.add.graphics().setPosition(at.x, at.y).setDepth(940);
    g.lineStyle(6, 0xb9ffff, 1);
    g.strokeEllipse(0, 0, 80, 54);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      g.lineStyle(3, 0xd8ffff, 0.9);
      g.lineBetween(Math.cos(a) * 25, Math.sin(a) * 17, Math.cos(a) * 55, Math.sin(a) * 36);
    }
    this.scene.tweens.add({
      targets: g,
      scaleX: 6,
      scaleY: 6,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }
  lightning(targets: Vec[]) {
    const g = this.scene.add.graphics().setDepth(960);
    const from = this.origin();
    for (const target of targets) {
      const points = [new Phaser.Math.Vector2(from.x, from.y - 30)];
      for (let i = 1; i < 9; i++)
        points.push(
          new Phaser.Math.Vector2(
            from.x + ((target.x - from.x) * i) / 9 + (i % 2 ? 14 : -14),
            from.y - 30 + ((target.y - from.y + 30) * i) / 9,
          ),
        );
      points.push(new Phaser.Math.Vector2(target.x, target.y));
      g.lineStyle(18, 0xa57aff, 0.25).strokePoints(points);
      g.lineStyle(7, 0xc5b0ff, 0.95).strokePoints(points);
      g.lineStyle(3, 0xffffff, 1).strokePoints(points);
      this.impact(target, true);
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 380, onComplete: () => g.destroy() });
  }
  meteorImpact(at: Vec) {
    this.nova(at);
    this.pulse(at, 0xff963d, 390, 650);
    this.emitter.setParticleTint(0xffb564);
    this.emitter.explode(32, at.x, at.y);
  }
  setPaused(paused: boolean) {
    this.emitter.timeScale = paused ? 0 : 1;
  }
}
