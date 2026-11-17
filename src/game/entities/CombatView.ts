import Phaser from 'phaser';
import type { Game } from '../engine';
import type { Enemy, Projectile } from '../types';

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
    this.crystal.body!.setCircle(21, -5, -5);
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
        const scale = e.kind === 'boss' ? 1.12 : e.kind === 'wraith' ? 0.8 : 0.76;
        sprite = this.scene.physics.add
          .sprite(e.x, e.y, e.kind)
          .setScale(scale)
          .setOrigin(0.5, 0.7);
        sprite.body?.setCircle(e.radius / scale, 48 - e.radius / scale, 67 - e.radius / scale);
        sprite.play(`${e.kind}-walk`);
        this.enemies.set(e.id, sprite);
        this.enemyModels.set(sprite, e);
        if (e.kind === 'boss') {
          sprite.setAlpha(0);
          this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 900 });
        }
      }
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.reset(e.x, e.y);
      // reset() places the body at sprite top-left; reapply the scaled circle offset before overlap.
      body.updateFromGameObject();
      sprite.setDepth(e.y).setFlipX(e.x > 225);
      if (e.hit > 0) sprite.setTintFill(0xe9fff1);
      else if (s.freeze > 0) sprite.setTint(0x8bdef5);
      else sprite.clearTint();
      if (s.freeze > 0 || s.status !== 'running') sprite.anims.pause();
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
          .image(shot.x, shot.y, 'spark')
          .setScale(shot.hostile ? 0.8 : 0.65)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(shot.hostile ? 0xe8a1f3 : 0xa5ffcf)
          .setDepth(900);
        sprite.body!.setCircle(8, 8, 8);
        this.shots.set(shot, sprite);
        this.shotModels.set(sprite, shot);
      }
      sprite.body!.reset(shot.x, shot.y);
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
      if (enemy && enemy.hp > 0 && this.game.state.freeze <= 0)
        this.game.hurt(enemy.kind === 'boss' ? 22 : 10);
    });
    this.scene.physics.overlap(this.crystal, [...this.shots.values()], (_a, b) => {
      const shot = this.shotModels.get(b as Phaser.GameObjects.GameObject);
      if (shot?.hostile && shot.life > 0) {
        this.game.hurt(shot.damage);
        shot.life = 0;
      }
    });
  }
  destroy() {
    this.enemies.forEach((e) => e.destroy());
    this.shots.forEach((s) => s.destroy());
    this.crystal.destroy();
  }
}
