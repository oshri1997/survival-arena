import Phaser from 'phaser';
import { Game } from './game/engine';
import { ArenaScene } from './game/scenes/ArenaScene';
import { Controller, readBest } from './ui/Controller';
import { SessionBus } from './integrations/local/SessionBus';
import { layout } from './ui/layout';
import './style.css';

document.getElementById('app')!.innerHTML = layout();
// Safari can retain a stale dvh on a height-only toolbar/viewport change.
const fitHeight = () =>
  document.documentElement.style.setProperty(
    '--arena-height',
    `${window.visualViewport?.height || innerHeight}px`,
  );
fitHeight();
window.addEventListener('resize', fitHeight);
window.visualViewport?.addEventListener('resize', fitHeight);

const session = new URLSearchParams(location.search).get('session') || 'arena';
export const rules = new Game(Math.random, readBest(), true);
const ui = new Controller(rules, new SessionBus(session));
export const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'phaser-game',
  width: innerWidth,
  height: innerHeight,
  backgroundColor: '#456748',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  render: { antialias: true, pixelArt: false, powerPreference: 'low-power' },
  fps: { target: 60 },
  scene: [new ArenaScene(rules)],
  audio: { noAudio: true },
});
const resize = new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width),
    height = Math.round(entry.contentRect.height);
  if (width > 0 && height > 0 && (game.scale.width !== width || game.scale.height !== height))
    game.scale.resize(width, height);
});
resize.observe(document.getElementById('phaser-game')!);
game.events.once('arena-ready', () => ui.ready());
// A host can keep the game tab open while operating the separate studio tab.
// Hidden-tab simulation uses the same rules with headless collision checks; no rendering is needed.
let lastBackground = Date.now();
const background = setInterval(() => {
  const now = Date.now();
  if (document.hidden && rules.state.status === 'running') {
    const steps = Math.min(120, Math.floor(((now - lastBackground) / 1000) * 60));
    for (let i = 0; i < steps; i++) rules.update(1 / 60, false);
  }
  lastBackground = now;
}, 100);
const loadTimeout = setTimeout(() => {
  if (rules.state.status === 'ready') document.getElementById('loading-error')!.hidden = false;
}, 15000);
game.events.once('arena-ready', () => clearTimeout(loadTimeout));
const dispose = () => {
  resize.disconnect();
  window.removeEventListener('resize', fitHeight);
  window.visualViewport?.removeEventListener('resize', fitHeight);
  clearInterval(background);
  clearTimeout(loadTimeout);
  ui.dispose();
};
game.events.once(Phaser.Core.Events.DESTROY, dispose);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    dispose();
    game.destroy(true);
  });
