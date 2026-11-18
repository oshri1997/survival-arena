import Phaser from 'phaser';
import type { Game } from '../engine';
import type { Enemy, Projectile } from '../types';
import { CRYSTAL_RADIUS } from '../config';

/** Owns Phaser bodies. Arcade overlap callbacks are the browser combat collision authority. */
export class CombatView {
  private enemies = new Map<number, Phaser.Physics.Arcade.Sprite>();
  private shots = new Map<Projectile, Phaser.Physics.Arcade.Image>();
  private enemyModels = new Map<Phaser.GameObjects.GameObject, Enemy>();
  private shotModels = new Map<Phaser.GameObjects.GameObject, Projectile>();
  readonly crystal: Phaser.Physics.Arcade.Image;
  constructor(
    private scene: Phaser.Scene,
    private game: Game,
  ) {
    this.crystal = scene.physics.add.image(225, 410, 'spark').setVisible(false);
    const body = this.crystal.body as Phaser.Physics.Arcade.Body;
    body.setCircle(CRYSTAL_RADIUS, 16 - CRYSTAL_RADIUS, 16 - CRYSTAL_RADIUS);
    body.moves = false;
    this.crystal.setImmovable(true);
  }
  sync() {
    const s = this.game.state;
    for (const [id, sprite] of this.enemies)
      if (!s.enemies.some((e) => e.id === id)) {
        this.enemyModels.delete(sprite);
        sprite.destroy();
        this.enemies.delete(id);
      }
    for (const e of s.enemies) {
      let sprite = this.enemies.get(e.id);
      if (!sprite) {
        const scale = e.kind === 'boss' ? 1.7 : e.kind === 'wraith' ? 1.15 : 1.12;
        sprite = this.scene.physics.add
          .sprite(e.x, e.y, e.kind)
          .setScale(scale)
          .setOrigin(0.5, 0.7);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setCircle(e.radius / scale, 48 - e.radius / scale, 67.2 - e.radius / scale);
        // Rules own position. Arcade calculates overlaps without moving the sprite afterward.
        body.moves = false;
        sprite.play(`${e.kind}-walk`);
        this.enemies.set(e.id, sprite);
        this.enemyModels.set(sprite, e);
        if (e.kind === 'boss') {
          sprite.setAlpha(0);
          this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 900 });
        }
      }
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      sprite.setPosition(e.x, e.y);
      body.updateFromGameObject();
      sprite.setDepth(e.y).setFlipX(e.x > s.player.x);
      if (e.hit > 0) sprite.setTintFill(0xe9fff1);
      else if (s.freeze > 0) sprite.setTint(0x8bdef5);
      else if (e.enraged) sprite.setTint(0xff8eaa);
      else sprite.clearTint();
      if (s.freeze > 0 || e.windup > 0 || s.status !== 'running') sprite.anims.pause();
      else sprite.anims.resume();
    }
    for (const [shot, sprite] of this.shots)
      if (!s.shots.includes(shot) || shot.life <= 0) {
        this.shotModels.delete(sprite);
        sprite.destroy();
        this.shots.delete(shot);
      }
    for (const shot of s.shots) {
      if (shot.life <= 0) continue;
      let sprite = this.shots.get(shot);
      if (!sprite) {
        sprite = this.scene.physics.add
          .image(shot.x, shot.y, 'bolt')
          .setScale(shot.hostile ? 0.65 : 0.55)
          .setRotation(Math.atan2(shot.vy, shot.vx) - Math.PI / 2)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(shot.hostile ? 0xe8a1f3 : 0xa5ffcf)
          .setDepth(900);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setCircle(8, 4, 24);
        body.moves = false;
        this.shots.set(shot, sprite);
        this.shotModels.set(sprite, shot);
      }
      sprite.setPosition(shot.x, shot.y);
      sprite.body!.updateFromGameObject();
    }
  }
  collide() {
    if (this.game.state.status !== 'running') return;
    const enemySprites = [...this.enemies.values()];
    this.scene.physics.overlap([...this.shots.values()], enemySprites, (a, b) => {
      const shot = this.shotModels.get(a as Phaser.GameObjects.GameObject);
      const enemy = this.enemyModels.get(b as Phaser.GameObjects.GameObject);
      if (shot && enemy && !shot.hostile && shot.life > 0 && enemy.hp > 0) {
        this.game.damageEnemy(enemy, shot.damage);
        shot.life = 0;
      }
    });
    this.scene.physics.overlap(this.crystal, enemySprites, (_a, b) => {
      const enemy = this.enemyModels.get(b as Phaser.GameObjects.GameObject);
      if (enemy && enemy.hp > 0 && enemy.windup === 0 && this.game.state.freeze <= 0)
        this.game.hurt(enemy.kind === 'boss' ? 17 : 10, enemy.id);
    });
    this.scene.physics.overlap(this.crystal, [...this.shots.values()], (_a, b) => {
      const shot = this.shotModels.get(b as Phaser.GameObjects.GameObject);
      if (shot?.hostile && shot.life > 0) {
        this.game.hurt(shot.damage);
        shot.life = 0;
      }
    });
  }
  impact(id: number, lethal: boolean) {
    const sprite = this.enemies.get(id);
    if (!sprite || !lethal) return;
    const ghost = this.scene.add
      .image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(0.5, 0.7)
      .setScale(sprite.scaleX)
      .setTint(0xffefc2)
      .setDepth(sprite.depth + 1);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: sprite.scaleX * 1.3,
      scaleY: sprite.scaleY * 1.3,
      y: sprite.y - 18,
      angle: 15,
      duration: 240,
      onComplete: () => ghost.destroy(),
    });
  }
  attack(id?: number) {
    const sprite = id === undefined ? undefined : this.enemies.get(id);
    if (!sprite) return;
    const crystal = this.game.state.player;
    const swipe = this.scene.add
      .image(sprite.x, sprite.y - 15, 'impact')
      .setScale(0.45)
      .setDepth(960)
      .setTint(0xff885e);
    this.scene.tweens.add({
      targets: swipe,
      x: crystal.x,
      y: crystal.y - 22,
      angle: 35,
      scale: 0.9,
      alpha: 0,
      duration: 170,
      onComplete: () => swipe.destroy(),
    });
  }
  destroy() {
    this.enemies.forEach((e) => e.destroy());
    this.shots.forEach((s) => s.destroy());
    this.crystal.destroy();
  }
}
