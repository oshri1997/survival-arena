import Phaser from 'phaser';
import { Game } from '../engine';
import { CombatView } from '../entities/CombatView';
import { Effects } from '../effects/Effects';
import type { EnemyKind } from '../types';

export class ArenaScene extends Phaser.Scene {
  private combat!: CombatView;
  private effects!: Effects;
  private crystal!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private readyActors: Phaser.GameObjects.Sprite[] = [];
  private unsubscribe?: () => void;
  private accumulator = 0;
  private slowFrames = 0;
  private mist!: Phaser.GameObjects.Particles.ParticleEmitter;
  constructor(readonly rules: Game) {
    super('Arena');
  }
  preload() {
    this.load.image('arena', '/assets/arena.png');
    for (const key of ['crystal', 'guardian', 'spark', 'torch'])
      this.load.image(key, `/assets/${key}.png`);
    for (const kind of ['imp', 'skeleton', 'wraith', 'boss'])
      this.load.spritesheet(kind, `/assets/${kind}.png`, { frameWidth: 96, frameHeight: 96 });
  }
  create() {
    this.cameras.main.setOrigin(0, 0).setZoom(this.scale.width / 450);
    this.add.image(225, 400, 'arena').setDisplaySize(450, 800);
    for (const kind of ['imp', 'skeleton', 'wraith', 'boss'] as EnemyKind[]) {
      this.anims.create({
        key: `${kind}-walk`,
        frames: this.anims.generateFrameNumbers(kind, { start: 0, end: 5 }),
        frameRate: kind === 'boss' ? 6 : 9,
        repeat: -1,
      });
    }
    this.glow = this.add
      .image(225, 390, 'spark')
      .setScale(11, 9)
      .setTint(0x64dc9e)
      .setAlpha(0.22)
      .setBlendMode('ADD')
      .setDepth(2);
    this.tweens.add({
      targets: this.glow,
      alpha: 0.35,
      scaleX: 12,
      scaleY: 10,
      yoyo: true,
      repeat: -1,
      duration: 2200,
      ease: 'Sine.easeInOut',
    });
    const rune = this.add.ellipse(225, 407, 172, 113).setStrokeStyle(1, 0xa9ecc1, 0.25).setDepth(3);
    this.tweens.add({ targets: rune, alpha: 0.3, duration: 1800, yoyo: true, repeat: -1 });
    this.crystal = this.add.image(225, 388, 'crystal').setScale(0.8).setDepth(410);
    if (this.renderer.type === Phaser.WEBGL)
      this.crystal.postFX.addGlow(0x7bf6b1, 2, 0, false, 0.05, 8);
    this.tweens.add({
      targets: this.crystal,
      y: 382,
      duration: 1900,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    });
    const guardian = this.add.image(278, 438, 'guardian').setScale(0.8).setDepth(440);
    this.tweens.add({
      targets: guardian,
      y: 436,
      duration: 1400,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    for (const [x, y] of [
      [57, 276],
      [391, 276],
      [57, 557],
      [391, 557],
    ]) {
      this.add.image(x, y, 'torch').setScale(0.7).setDepth(y);
      const light = this.add
        .image(x, y - 34, 'spark')
        .setScale(4.6, 4)
        .setTint(0xffaf6b)
        .setAlpha(0.25)
        .setBlendMode('ADD')
        .setDepth(5);
      this.tweens.add({
        targets: light,
        alpha: 0.38,
        scaleX: 5,
        duration: 650 + x,
        yoyo: true,
        repeat: -1,
      });
      this.add
        .particles(x, y - 41, 'spark', {
          lifespan: 600,
          speedY: { min: -24, max: -12 },
          speedX: { min: -6, max: 6 },
          frequency: 150,
          scale: { start: 0.16, end: 0 },
          tint: [0xffd299, 0xf3b570],
          blendMode: 'ADD',
          maxParticles: 12,
        })
        .setDepth(y + 1);
    }
    this.mist = this.add
      .particles(0, 0, 'spark', {
        x: { min: 25, max: 425 },
        y: { min: 130, max: 690 },
        lifespan: 4500,
        speedX: { min: -6, max: 6 },
        speedY: { min: -10, max: -3 },
        frequency: 200,
        alpha: { start: 0.03, end: 0.6 },
        scale: { start: 0.03, end: 0.12 },
        tint: [0xabdc94, 0xe2e8b5],
        blendMode: 'ADD',
        maxParticles: 28,
      })
      .setDepth(800);
    for (const [x, y, kind] of [
      [103, 260, 'imp'],
      [342, 352, 'skeleton'],
      [129, 547, 'wraith'],
    ] as [number, number, EnemyKind][]) {
      this.readyActors.push(
        this.add
          .sprite(x, y, kind)
          .setScale(0.82)
          .setOrigin(0.5, 0.7)
          .setDepth(y)
          .play(`${kind}-walk`),
      );
    }
    this.combat = new CombatView(this, this.rules);
    this.effects = new Effects(this);
    this.unsubscribe = this.rules.on((event) => {
      if (event.type === 'spell') {
        if (event.effect === 'lightning') this.effects.lightning(event.targets);
        else this.effects.meteors(event.targets.length ? event.targets : [{ x: 225, y: 410 }]);
      }
      if (event.type !== 'sound') return;
      if (event.sound === 'hit') {
        this.cameras.main.shake(100, 0.003);
        this.crystal.setTintFill(0xffd4cc);
        this.time.delayedCall(140, () => this.crystal.clearTint());
      }
      if (event.sound === 'nova') this.cameras.main.shake(200, 0.005);
      if (event.sound === 'boss') {
        this.cameras.main.shake(450, 0.003);
        this.cameras.main.flash(450, 97, 49, 94, false);
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.combat.destroy();
    });
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      requestAnimationFrame(() => this.game.events.emit('arena-ready'));
    });
  }
  update(_time: number, delta: number) {
    const s = this.rules.state,
      paused = s.status !== 'running' && s.status !== 'ready';
    this.readyActors.forEach((actor) => actor.setVisible(s.status === 'ready'));
    this.tweens.timeScale = paused ? 0 : 1;
    this.effects.setPaused(paused);
    this.mist.timeScale = paused ? 0 : 1;
    this.accumulator += Math.min(delta / 1000, 0.1);
    while (this.accumulator >= 1 / 60) {
      this.rules.update(1 / 60);
      this.combat.sync();
      this.combat.collide();
      this.accumulator -= 1 / 60;
    }
    this.effects.update(this.rules.state);
    // Drop decorative firefly density on sustained slow frames; gameplay is unchanged.
    if (delta > 25) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 30) {
      this.mist.setFrequency(500);
      this.crystal.postFX?.clear();
      this.slowFrames = 0;
    }
  }
}
