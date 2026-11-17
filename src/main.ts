import Phaser from 'phaser';
import { Game } from './game/engine';
import { ArenaScene } from './game/scenes/ArenaScene';
import { Controller, readBest } from './ui/Controller';
import { layout } from './ui/layout';
import './style.css';

document.getElementById('app')!.innerHTML = layout();
const broadcast = new URLSearchParams(location.search).get('broadcast') === '1';
if (broadcast) {
  document.body.classList.add('broadcast-mode');
  const frame = document.getElementById('arena-frame')!;
  const resize = new ResizeObserver(([entry]) => {
    frame.style.setProperty('--broadcast-scale', String(entry.contentRect.width / 450));
  });
  resize.observe(frame);
  if (import.meta.hot) import.meta.hot.dispose(() => resize.disconnect());
}
export const rules = new Game(Math.random, readBest(), true);
const ui = new Controller(rules);
export const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'phaser-game',
  width: broadcast ? 1080 : 450,
  height: broadcast ? 1920 : 800,
  backgroundColor: '#14271d',
  transparent: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  render: { antialias: true, pixelArt: false, powerPreference: 'low-power', roundPixels: false },
  fps: { target: 60, forceSetTimeOut: false },
  scene: [new ArenaScene(rules)],
  audio: { noAudio: true }, // Gesture-gated Web Audio is owned by audio/Sound.ts.
});
game.events.once('arena-ready', () => ui.ready());
game.events.on(Phaser.Core.Events.HIDDEN, () => rules.pause());
game.events.once(Phaser.Core.Events.DESTROY, () => ui.dispose());
// A readable failure state instead of an indefinitely disabled start button.
const loadTimeout = window.setTimeout(() => {
  if (document.querySelector<HTMLButtonElement>('#start')?.disabled)
    document.getElementById('loading-error')!.hidden = false;
}, 15000);
game.events.once('arena-ready', () => clearTimeout(loadTimeout));
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearTimeout(loadTimeout);
    ui.dispose();
    game.destroy(true);
  });
