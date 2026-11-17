import { GIFTS } from '../game/config';
import { icon } from './icons';

/** The audience sees a game, never the broadcaster's dashboard. */
export const layout = () => `
<main id="arena-frame" class="arena" aria-label="Survival Arena">
  <div id="phaser-game" role="img" aria-label="Monsters are attacking the glowing crystal. Tap a gift to help or summon a boss."></div>
  <header class="hud" id="hud">
    <div class="wave"><span>WAVE</span><b id="wave">1</b></div>
    <div class="health" aria-label="Crystal health">
      ${icon('crystal')}<div class="health-track" role="progressbar" aria-label="Crystal health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="hp-bar"></i></div><b id="hp-text">100%</b>
    </div>
  </header>
  <div id="moment" class="moment" role="status" hidden></div>
  <div id="gift-toast" class="gift-toast" role="status" hidden></div>
  <div id="run-state" class="run-state" hidden><span id="run-message"></span><button id="retry" aria-label="Play again">${icon('play')}</button></div>
  <nav class="interactions" id="interactions" aria-label="Simulated viewer interactions">
    <span class="simulation-tag" title="Local simulated gifts. No TikTok account connected.">SIM</span>
    ${Object.entries(GIFTS)
      .map(
        ([kind, gift]) =>
          `<button data-gift="${kind}" style="--gift-color:${gift.color}" aria-label="Simulate ${gift.name}" title="${gift.effect}"><span class="interaction-icon">${icon(gift.icon)}</span><small>${({ rose: '+25 HP', ice: 'FREEZE', meteor: 'METEOR', crown: 'BOSS' } as Record<string, string>)[kind]}</small></button>`,
      )
      .join('')}
  </nav>
  <div id="loading-error" class="load-message" hidden>Couldn’t load the arena. Reload to try again.</div>
</main>`;
