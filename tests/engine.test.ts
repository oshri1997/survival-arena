import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import { COOLDOWNS } from '../src/game/config';
const advance = (game: Game, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) game.update(1 / 60);
};
const makeGame = () => {
  let seed = 324;
  const game = new Game(() => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  game.start();
  return game;
};

describe('crystal defense rules', () => {
  it('spawns moving enemies and automatic projectiles, awards kills and experience', () => {
    const game = makeGame();
    advance(game, 20);
    expect(game.state.kills).toBeGreaterThan(0);
    expect(game.state.score).toBeGreaterThan(0);
    expect(game.state.xp).toBe(game.state.kills * 10);
    expect(game.state.spawnRemaining).toBeLessThan(12);
  });
  it('pauses simulation, abilities and gifts without advancing cooldowns', () => {
    const game = makeGame();
    game.skill('nova');
    game.pause();
    const time = game.state.time;
    const remaining = game.state.cooldowns.nova;
    advance(game, 10);
    expect(game.state.time).toBe(time);
    expect(game.state.cooldowns.nova).toBe(remaining);
    expect(game.gift('meteor')).toBe(false);
    expect(game.skill('frost')).toBe(false);
    game.resume();
    advance(game, 1);
    expect(game.state.time).toBeGreaterThan(time);
  });
  it('enforces skill cooldowns and freezes enemy movement', () => {
    const game = makeGame(),
      enemy = game.spawn('skeleton');
    expect(game.skill('frost')).toBe(true);
    expect(game.skill('frost')).toBe(false);
    const { x, y } = enemy;
    advance(game, 1);
    expect(enemy.x).toBe(x);
    expect(enemy.y).toBe(y);
    expect(game.state.cooldowns.frost).toBeLessThan(COOLDOWNS.frost);
    expect(game.state.freeze).toBeGreaterThan(3.9);
  });
  it('deals area damage and counts each dead enemy once', () => {
    const game = makeGame(),
      enemy = game.spawn('imp');
    enemy.x = 225;
    enemy.y = 420;
    game.skill('nova');
    game.damageEnemy(enemy, 900);
    expect(game.state.kills).toBe(1);
    expect(game.state.score).toBe(20);
    expect(game.state.enemies).toHaveLength(0);
  });
  it('lets enemies attack and reaches game over with a restartable best score', () => {
    const game = makeGame();
    game.state.score = 250;
    game.state.damage = 0;
    const enemy = game.spawn('skeleton');
    enemy.x = 225;
    enemy.y = 410;
    advance(game, 12);
    expect(game.state.status).toBe('gameover');
    expect(game.state.hp).toBe(0);
    expect(game.state.best).toBe(250);
    expect(game.gift('rose')).toBe(false);
    game.start();
    expect(game.state.hp).toBe(100);
    expect(game.state.score).toBe(0);
    expect(game.state.best).toBe(250);
    expect(game.state.cooldowns).toEqual({ nova: 0, frost: 0, lightning: 0 });
  });
  it('clears an entire real wave and offers a functional permanent upgrade', () => {
    const game = makeGame();
    for (let i = 0; i < 60 * 60 && game.state.status === 'running'; i++) {
      game.update(1 / 60);
      if (i % 300 === 0) game.skill('nova');
    }
    expect(game.state.status).toBe('upgrade');
    expect(game.state.kills).toBe(12);
    const damage = game.state.damage;
    expect(game.upgrade('power')).toBe(true);
    expect(game.state.wave).toBe(2);
    expect(game.state.damage).toBe(damage + 7);
    expect(game.state.spawnRemaining).toBe(16);
    expect(game.upgrade('power')).toBe(false);
  });
  it('spawns a boss on every fifth wave and allows only one at a time', () => {
    const game = makeGame();
    for (let i = 1; i < 5; i++) {
      game.state.spawnRemaining = 0;
      game.state.enemies = [];
      advance(game, 1.3);
      expect(game.state.status).toBe('upgrade');
      game.upgrade('vitality');
    }
    expect(game.state.wave).toBe(5);
    expect(game.state.enemies.filter((e) => e.kind === 'boss')).toHaveLength(1);
    expect(game.summonBoss()).toBe(false);
    expect(game.state.maxHp).toBe(180);
    const boss = game.state.enemies[0];
    game.state.invulnerable = 100;
    boss.hp = boss.maxHp * 0.4;
    advance(game, 4);
    expect(
      game.state.hazards.length + game.state.shots.filter((s) => s.hostile).length,
    ).toBeGreaterThan(0);
  });
  it('implements all four mock gift effects with capped healing', () => {
    const game = makeGame();
    game.state.hp = 50;
    game.gift('rose');
    expect(game.state.hp).toBe(75);
    game.gift('rose');
    game.gift('rose');
    expect(game.state.hp).toBe(100);
    game.gift('ice');
    expect(game.state.freeze).toBe(5);
    const enemy = game.spawn('skeleton');
    game.gift('meteor');
    expect(enemy.hp).toBeLessThanOrEqual(0);
    game.gift('crown');
    expect(game.state.enemies[0].kind).toBe('boss');
    expect(game.state.gifts).toBe(6);
  });
  it('clamps large frame deltas, ignores invalid time and bounds visual particle memory', () => {
    const game = makeGame();
    game.update(10);
    expect(game.state.time).toBe(0.05);
    game.update(NaN);
    game.update(-1);
    expect(game.state.time).toBe(0.05);
    for (let i = 0; i < 100; i++) game.burst(game.state.player, '#fff', 100);
    expect(game.state.particles.length).toBeLessThanOrEqual(220);
  });
});
