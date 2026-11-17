import Phaser from 'phaser';
import type { GameState, Particle, Vec } from '../types';
export class Effects {
  private seen = new WeakSet<Particle>();
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private graphics: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private bossLabel: Phaser.GameObjects.Text;
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
        .setPosition(boss.x, boss.y - 135);
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
    for (const h of s.hazards) {
      g.fillStyle(0xf478a8, 0.15 + (1 - h.remaining / 1.2) * 0.25);
      g.fillCircle(h.x, h.y, h.radius);
      g.lineStyle(4, 0xff8db3, 0.95);
      g.strokeCircle(h.x, h.y, h.radius);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(h.x, h.y, h.radius * (1 - h.remaining / 1.2));
    }
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
      if (e.hp < e.maxHp) {
        const w = e.kind === 'boss' ? 88 : 36,
          oy = e.kind === 'boss' ? 112 : 62;
        g.fillStyle(0x2c3c2a, 0.8);
        g.fillRoundedRect(e.x - w / 2, e.y - oy, w, 6, 3);
        g.fillStyle(e.kind === 'boss' ? 0xff9b7b : 0xffd795, 1);
        g.fillRoundedRect(e.x - w / 2, e.y - oy, w * Math.max(0, e.hp / e.maxHp), 6, 3);
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
  nova(at: Vec, color = 0xffae4e) {
    const ring = this.scene.add.graphics().setDepth(940);
    ring.lineStyle(12, color, 0.7);
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
      if (color !== 0xffae4e) fire.setTint(color);
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
  meteors(targets: Vec[]) {
    for (const [i, target] of targets.entries()) {
      const meteor = this.scene.add
        .image(target.x - 85, target.y - 320, 'fireball')
        .setScale(1.1, 1.7)
        .setRotation(-0.26)
        .setDepth(970);
      this.scene.tweens.add({
        targets: meteor,
        x: target.x,
        y: target.y,
        duration: 350,
        delay: i * 65,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.emitter.setParticleTint(0xffb564);
          this.emitter.explode(20, target.x, target.y);
          this.impact(target, true);
          meteor.destroy();
        },
      });
    }
  }
  setPaused(paused: boolean) {
    this.emitter.timeScale = paused ? 0 : 1;
  }
}
