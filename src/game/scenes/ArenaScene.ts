import Phaser from 'phaser';
import { Game } from '../engine';
import { CombatView } from '../entities/CombatView';
import { Effects } from '../effects/Effects';
import type { EnemyKind } from '../types';

export class ArenaScene extends Phaser.Scene {
  private combat!: CombatView;
  private effects!: Effects;
  private crystal!: Phaser.GameObjects.Image;
  private guardian!: Phaser.GameObjects.Image;
  private floor!: Phaser.GameObjects.TileSprite;
  private arena!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private muzzle!: Phaser.GameObjects.Image;
  private shotFlash?: Phaser.Tweens.Tween;
  private torches: Phaser.GameObjects.Image[] = [];
  private unsubscribe?: () => void;
  private accumulator = 0;
  private slowFrames = 0;
  private mist!: Phaser.GameObjects.Particles.ParticleEmitter;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(readonly rules: Game) {
    super('Arena');
  }
  preload() {
    for (const key of [
      'arena',
      'arena-wide',
      'floor',
      'crystal',
      'guardian',
      'spark',
      'torch',
      'bolt',
      'fireball',
      'impact',
    ])
      this.load.image(key, `/assets/${key}.png`);
    for (const kind of ['imp', 'skeleton', 'wraith', 'boss'])
      this.load.spritesheet(kind, `/assets/${kind}.png`, { frameWidth: 96, frameHeight: 96 });
  }
  create() {
    this.floor = this.add.tileSprite(0, 0, 450, 800, 'floor').setOrigin(0);
    this.arena = this.add.image(225, 400, 'arena').setDisplaySize(450, 800);
    for (const kind of ['imp', 'skeleton', 'wraith', 'boss'] as EnemyKind[])
      this.anims.create({
        key: `${kind}-walk`,
        frames: this.anims.generateFrameNumbers(kind, { start: 0, end: 5 }),
        frameRate: kind === 'boss' ? 7 : 11,
        repeat: -1,
      });
    this.glow = this.add
      .image(225, 390, 'spark')
      .setScale(11, 9)
      .setTint(0x7dfff0)
      .setAlpha(0.3)
      .setBlendMode('ADD')
      .setDepth(2);
    this.tweens.add({
      targets: this.glow,
      alpha: 0.5,
      scaleX: 12,
      scaleY: 10,
      yoyo: true,
      repeat: -1,
      duration: 1800,
      ease: 'Sine.easeInOut',
    });
    this.crystal = this.add.image(225, 388, 'crystal').setScale(1.12).setDepth(410);
    this.tweens.add({
      targets: this.crystal,
      y: 382,
      duration: 1500,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    });
    this.guardian = this.add.image(285, 450, 'guardian').setScale(1.1).setDepth(450);
    this.muzzle = this.add
      .image(316, 421, 'impact')
      .setScale(0.35)
      .setTint(0xc8ffff)
      .setDepth(895)
      .setVisible(false);
    this.tweens.add({
      targets: this.guardian,
      angle: 2,
      duration: 900,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    for (let i = 0; i < 4; i++) this.torches.push(this.add.image(0, 0, 'torch').setScale(0.85));
    this.mist = this.add
      .particles(0, 0, 'spark', {
        x: { min: 25, max: 425 },
        y: { min: 100, max: 690 },
        lifespan: 3000,
        speedY: { min: -12, max: -3 },
        frequency: this.reducedMotion ? 700 : 200,
        alpha: { start: 0.1, end: 0.7 },
        scale: { start: 0.03, end: 0.13 },
        tint: [0xd5ffb5, 0xf5ec9a],
        blendMode: 'ADD',
        maxParticles: 20,
      })
      .setDepth(800);
    this.combat = new CombatView(this, this.rules);
    this.effects = new Effects(this, () => this.rules.state.player);
    this.resize(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.unsubscribe = this.rules.on((event) => {
      if (document.hidden) return;
      if (event.type === 'impact') {
        this.effects.impact(event.at, event.lethal);
        this.combat.impact(event.id, event.lethal);
      }
      if (event.type === 'spawn') this.effects.spawn(event.at, event.kind === 'boss');
      if (event.type === 'meteor-landed') this.effects.meteorImpact(event.at);
      if (event.type === 'heal')
        this.effects.pulse(event.at, 0xb0ff8a, event.amount ? 210 : 130, 500);
      if (event.type === 'boss-phase') this.effects.pulse(event.at, 0xff537b, 250, 500);
      if (event.type === 'boss-interrupted') this.effects.pulse(event.at, 0xc3faff, 230, 530);
      if (event.type === 'boss-defeated') this.effects.pulse(event.at, 0xffdb86, 470, 700);
      if (event.type === 'boss-strike') this.effects.bossStrike(event.at);
      if (event.type === 'crystal-hit') this.combat.attack(event.attackerId);
      if (event.type === 'spell') {
        if (event.effect === 'lightning') this.effects.lightning(event.targets);
        if (event.effect === 'nova') this.effects.nova(this.rules.state.player);
        if (event.effect === 'frost') this.effects.frost(this.rules.state.player);
      }
      if (event.type !== 'sound') return;
      if (event.sound === 'shot') {
        this.shotFlash?.stop();
        this.muzzle.setScale(0.26).setAlpha(0.95).setVisible(true);
        this.shotFlash = this.tweens.add({
          targets: this.muzzle,
          alpha: 0,
          scale: 0.55,
          duration: 120,
          onComplete: () => this.muzzle.setVisible(false),
        });
      }
      if (event.sound === 'hit') {
        if (!this.reducedMotion) this.cameras.main.shake(100, 0.002);
        this.crystal.setTintFill(0xffcbb7);
        this.time.delayedCall(130, () => this.crystal.clearTint());
      }
      if (event.sound === 'nova' && !this.reducedMotion) this.cameras.main.shake(180, 0.003);
      if (event.sound === 'boss') {
        if (!this.reducedMotion) this.cameras.main.shake(300, 0.003);
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.combat.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
    });
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () =>
      requestAnimationFrame(() => this.game.events.emit('arena-ready')),
    );
  }
  private resize(size: Phaser.Structs.Size) {
    const zoom = size.height / 800,
      width = size.width / zoom;
    this.rules.setBounds(width, 800);
    const cx = width / 2;
    this.cameras.main.setOrigin(0, 0).setZoom(zoom);
    this.floor.setSize(width, 800);
    this.arena
      .setTexture(width > 650 ? 'arena-wide' : 'arena')
      .setDisplaySize(width > 650 ? width : 450, 800)
      .setPosition(cx, 400);
    this.glow.setPosition(cx, 390);
    this.crystal.setX(cx);
    this.guardian.setX(cx + 62);
    this.muzzle.setPosition(cx + 91, this.rules.state.player.y + 11);
    this.torches.forEach((torch, i) =>
      torch
        .setPosition(cx + (i % 2 ? 1 : -1) * (width > 650 ? width * 0.39 : 168), i < 2 ? 260 : 580)
        .setDepth(i < 2 ? 260 : 580),
    );
    this.combat.crystal.setPosition(cx, this.rules.state.player.y);
    this.combat.crystal.body!.updateFromGameObject();
  }
  update(_time: number, delta: number) {
    if (!this.combat) return;
    const paused = this.rules.state.status !== 'running' && this.rules.state.status !== 'ready';
    this.tweens.timeScale = paused ? 0 : 1;
    this.effects.setPaused(paused);
    this.mist.timeScale = paused ? 0 : 1;
    // Hidden-tab simulation is advanced in main.ts, never in both places.
    if (!document.hidden) {
      this.accumulator += Math.min(delta / 1000, 0.1);
      while (this.accumulator >= 1 / 60) {
        this.rules.update(1 / 60);
        this.combat.sync();
        this.combat.collide();
        this.accumulator -= 1 / 60;
      }
    }
    this.effects.update(this.rules.state);
    if (delta > 25) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 30) {
      this.mist.setFrequency(700);
      this.slowFrames = 0;
    }
  }
}
