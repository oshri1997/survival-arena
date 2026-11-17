import Phaser from 'phaser';
import type { GameState, Particle } from '../types';

export class Effects {
  private seen = new WeakSet<Particle>();
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private graphics: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(950);
    this.emitter = scene.add
      .particles(0, 0, 'spark', {
        emitting: false,
        lifespan: { min: 250, max: 700 },
        speed: { min: 20, max: 110 },
        scale: { start: 0.3, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
        maxParticles: 240,
      })
      .setDepth(920);
    for (let i = 0; i < 30; i++)
      this.labels.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: 'Arial',
            fontSize: '13px',
            fontStyle: 'bold',
            stroke: '#15251f',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(980)
          .setVisible(false),
      );
  }
  update(s: GameState) {
    const g = this.graphics;
    g.clear();
    for (const p of s.particles)
      if (!this.seen.has(p)) {
        this.seen.add(p);
        this.emitter.setParticleTint(Phaser.Display.Color.HexStringToColor(p.color).color);
        this.emitter.emitParticleAt(p.x, p.y, 1);
      }
    for (const r of s.rings) {
      const progress = 1 - r.life / r.maxLife;
      g.lineStyle(
        3 * (1 - progress) + 0.5,
        Phaser.Display.Color.HexStringToColor(r.color).color,
        (1 - progress) * 0.9,
      );
      g.strokeEllipse(r.x, r.y, r.radius * progress * 2, r.radius * progress * 1.3);
      g.lineStyle(1, 0xffffff, (1 - progress) * 0.3);
      g.strokeEllipse(r.x, r.y, r.radius * progress * 1.8, r.radius * progress * 1.15);
    }
    for (const h of s.hazards) {
      g.fillStyle(0xc7629f, 0.1 + (1 - h.remaining / 1.2) * 0.2);
      g.fillCircle(h.x, h.y, h.radius);
      g.lineStyle(2, 0xe495bd, 0.8);
      g.strokeCircle(h.x, h.y, h.radius);
      g.lineStyle(2, 0xffd5ea, 0.5);
      g.strokeCircle(h.x, h.y, h.radius * (1 - h.remaining / 1.2));
    }
    for (const e of s.enemies)
      if (e.hp < e.maxHp && e.kind !== 'boss') {
        g.fillStyle(0x091c14, 0.9);
        g.fillRoundedRect(e.x - 15, e.y - 44, 30, 4, 2);
        g.fillStyle(s.freeze > 0 ? 0x9adef0 : 0xc4bd80, 1);
        g.fillRoundedRect(e.x - 15, e.y - 44, 30 * Math.max(0, e.hp / e.maxHp), 4, 2);
      }
    this.labels.forEach((label, i) => {
      const t = s.texts[i];
      label.setVisible(!!t);
      if (t)
        label
          .setPosition(t.x, t.y - 35)
          .setText(t.text)
          .setColor(t.color)
          .setAlpha(Math.min(1, t.life * 2));
    });
  }
  lightning(targets: { x: number; y: number }[]) {
    const g = this.scene.add.graphics().setDepth(960);
    for (const target of targets) {
      const points = [{ x: 225, y: 355 }];
      for (let i = 1; i < 7; i++)
        points.push({
          x: 225 + ((target.x - 225) * i) / 7 + (i % 2 ? 12 : -12),
          y: 355 + ((target.y - 355) * i) / 7,
        });
      points.push(target);
      const vectors = points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
      g.lineStyle(7, 0xa38de8, 0.3).strokePoints(vectors);
      g.lineStyle(2, 0xe5e0ff, 1).strokePoints(vectors);
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 350, onComplete: () => g.destroy() });
  }
  meteors(targets: { x: number; y: number }[]) {
    for (const [index, target] of targets.entries()) {
      const meteor = this.scene.add
        .image(target.x - 70, target.y - 190, 'spark')
        .setTint(0xffba79)
        .setScale(0.65, 2.8)
        .setRotation(-0.35)
        .setBlendMode('ADD')
        .setDepth(970);
      this.scene.tweens.add({
        targets: meteor,
        x: target.x,
        y: target.y,
        duration: 300,
        delay: index * 45,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.emitter.setParticleTint(0xffba79);
          this.emitter.explode(12, target.x, target.y);
          meteor.destroy();
        },
      });
    }
  }
  setPaused(paused: boolean) {
    this.emitter.timeScale = paused ? 0 : 1;
  }
}
