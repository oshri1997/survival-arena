import { GIFTS } from '../game/config';
import { icon } from './icons';
export const layout = () => `
<header class="site-header">
  <a class="brand" href="./" aria-label="Survival Arena home"><span class="brand-mark">${icon('crystal')}</span><span>SURVIVAL ARENA <small>THE LIVE EXPERIENCE</small></span></a>
  <nav aria-label="Main navigation"><span class="nav-active">The arena</span><button data-action="help">How to play ${icon('external')}</button></nav>
  <div class="header-actions"><span class="demo-label"><i></i> SIMULATION MODE</span><a class="broadcast-link" title="Open a clean, separate arena run" href="?broadcast=1" target="_blank" rel="noopener">Broadcast view ${icon('external')}</a><button class="studio-mobile icon-button" data-action="studio" aria-label="Open broadcaster controls">${icon('settings')}</button></div>
</header>
<main class="main-layout">
  <aside class="intro-panel">
    <div class="eyebrow"><span class="tiny-line"></span> ENDLESS FANTASY SURVIVAL</div>
    <h1>Defend the<br>last <em>light.</em></h1>
    <p class="intro-copy">One crystal. An endless horde.<br>And a little help from your audience.</p>
    <div class="chapter-card"><span class="chapter-number">I</span><div><small>YOUR BATTLEGROUND</small><strong>The Hollow</strong><span>An ancient forest, awakened.</span></div>${icon('leaf')}</div>
    <div class="guide-list">
      <div><span class="guide-icon">${icon('shield')}</span><p><strong>Protect the crystal</strong><small>Your guardian attacks automatically.</small></p></div>
      <div><span class="guide-icon">${icon('bolt')}</span><p><strong>Turn the tide</strong><small>Cast spells. Choose your upgrades.</small></p></div>
      <div><span class="guide-icon">${icon('users')}</span><p><strong>Let the crowd join in</strong><small>Simulated gifts bring the arena to life.</small></p></div>
    </div>
    <div class="personal-best">${icon('crown')}<div><small>PERSONAL BEST</small><b id="personal-best">0 <span>PTS</span></b></div><span class="best-decoration">✧</span></div>
    <p class="side-note">Made for the moment.<br>Built for LIVE.</p>
  </aside>
  <section class="game-column" aria-label="Survival Arena game">
    <div class="arena-caption"><span><i></i> THE HOLLOW</span><span>01 <span class="caption-slash">/</span> ∞</span></div>
    <div class="arena-frame" id="arena-frame">
      <div id="phaser-game" role="img" aria-label="Enchanted forest arena. Defend the central crystal using the spell buttons below."></div>
      <div class="arena-shade"></div>
      <div class="game-hud">
        <div class="hud-top"><span class="live-badge"><i></i> DEMO LIVE</span><div class="hud-actions"><button class="icon-button" id="sound" aria-label="Mute sound">${icon('sound')}</button><button class="icon-button" id="pause" aria-label="Pause game" disabled>${icon('pause')}</button></div></div>
        <div class="score-row"><div class="wave-stat"><small>WAVE</small><strong id="wave">01</strong><span id="wave-name">THE AWAKENING</span></div><div class="right-stats"><div><small>SCORE</small><b id="score">0</b></div><div class="kills-stat">${icon('sword')}<span id="kills">0</span><small>VANQUISHED</small></div></div></div>
        <div class="crystal-health"><div><span>${icon('crystal')} CRYSTAL INTEGRITY</span><b id="hp-text">100 / 100</b></div><div class="health-track" role="progressbar" aria-label="Crystal health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div id="hp-bar"></div></div></div>
        <div class="wave-progress"><span id="wave-progress-label">12 enemies incoming</span><span id="timer">00:00</span></div>
        <div class="boss-health" id="boss-health" hidden><div><span>☩ THE HOLLOW KING</span><b id="boss-phase">PHASE I</b></div><div><i id="boss-hp"></i></div></div>
      </div>
      <div class="boss-announcement" id="boss-announcement" hidden><small>AN ANCIENT EVIL AWAKENS</small><strong>The Hollow King</strong><span>Watch the ground. Break his reign.</span></div>
      <div class="gift-toast" id="gift-toast" role="status" hidden></div>
      <div class="game-bottom">
        <div class="crystal-label"><span class="label-diamond"></span> THE LAST LIGHT <span class="label-diamond"></span></div>
        <div class="spell-bar" aria-label="Abilities">
          <button class="spell fire" data-skill="nova" disabled><span class="spell-art">${icon('fire')}<span class="cooldown"></span></span><strong>FIRE NOVA</strong><small><kbd>Q</kbd> AREA DAMAGE</small></button>
          <button class="spell frost" data-skill="frost" disabled><span class="spell-art">${icon('ice')}<span class="cooldown"></span></span><strong>FROST WARD</strong><small><kbd>W</kbd> FREEZE · 5S</small></button>
          <button class="spell lightning" data-skill="lightning" disabled><span class="spell-art">${icon('bolt')}<span class="cooldown"></span></span><strong>ARC LIGHTNING</strong><small><kbd>E</kbd> CHAIN ATTACK</small></button>
        </div>
        <div class="auto-defense"><i></i> AUTO-DEFENSE ACTIVE <span>CAST SPELLS TO ASSIST</span></div>
      </div>
      <div class="game-overlay ready-overlay" id="game-overlay">
        <div class="overlay-card" id="overlay-card"><span class="overlay-rune">${icon('crystal')}</span><small class="eyebrow">THE HOLLOW IS WAKING</small><h2>Be its guardian.</h2><p>Hold back the darkness.<br>Keep the last crystal alive.</p><button class="primary-button" id="start" disabled>Preparing the arena…</button><span class="start-note">AUTO COMBAT · YOU COMMAND THE MAGIC</span></div>
      </div>
      <div class="loading-error" id="loading-error" hidden>Unable to load the arena. Please reload to try again.</div>
    </div>
    <div class="below-arena"><span>${icon('shield')} NO REAL TIKTOK CONNECTION</span><button data-action="help">Quick guide ${icon('arrow')}</button></div>
  </section>
  <aside class="studio-panel" id="studio-panel" aria-label="Broadcaster controls">
    <div class="studio-heading"><div><span class="eyebrow">BROADCASTER STUDIO</span><h2>Make it a LIVE moment.</h2></div><button class="icon-button studio-close" data-action="close-studio" aria-label="Close broadcaster controls">${icon('close')}</button></div>
    <div class="simulation-notice"><i></i><span>Mock events only</span><small>NO ACCOUNT CONNECTED</small></div>
    <div class="studio-metrics"><div>${icon('eye')}<b id="viewers">0</b><span>VIEWERS</span></div><div>${icon('heart')}<b id="likes">0</b><span>LIKES</span></div><div>${icon('rose')}<b id="gift-count">0</b><span>GIFTS</span></div></div>
    <div class="section-label"><span>SEND A LITTLE MAGIC</span><small>SIMULATED GIFTS</small></div>
    <div class="gift-grid">${Object.entries(GIFTS)
      .map(
        ([kind, gift]) =>
          `<button class="gift-card" data-gift="${kind}" style="--gift-color:${gift.color}" disabled><span class="gift-icon">${icon(gift.icon)}</span><strong>${gift.name}</strong><small>${gift.effect}</small><span class="gift-send">Send ${icon('arrow')}</span></button>`,
      )
      .join('')}</div>
    <div class="auto-sim"><div><strong>Keep the crowd going</strong><small>Send a mock event every few seconds</small></div><button class="switch" id="auto-events" role="switch" aria-checked="false" aria-label="Automatic simulated events"><span></span></button></div>
    <div class="section-label feed-heading"><span>LIVE ACTIVITY</span><span class="event-count" id="event-count">0 EVENTS</span></div>
    <ol class="activity-feed" id="activity-feed" aria-label="Simulated activity"><li class="feed-empty">${icon('chat')}<span>Your crowd is quiet…<small>Start a run, then send some magic.</small></span></li></ol>
    <details class="event-tools"><summary>More event controls ${icon('settings')}</summary><div><select id="event-type" aria-label="Mock event type"><option value="ViewerJoined">Viewer joins</option><option value="ChatMessage">Chat message</option><option value="LikeReceived">10 likes</option><option value="FollowReceived">New follower</option></select><input id="chat-message" aria-label="Mock chat message" maxlength="120" placeholder="Protect the crystal!"/><button class="secondary-button" id="send-event" disabled>Send event ${icon('arrow')}</button><button class="secondary-button" id="crowd" disabled>${icon('users')} Simulate a crowd</button></div></details>
    <p class="studio-footnote">A playground for your next stream.<br>All viewers, gifts, and activity are simulated.</p>
  </aside>
</main>
<footer class="site-footer"><span>© SURVIVAL ARENA <span class="footer-dot">·</span> A LITTLE MAGIC. A LOT OF CHAOS.</span><span>PLAYABLE VERTICAL SLICE <i></i> V2.0</span></footer>
<dialog id="help-dialog" aria-labelledby="help-title"><button class="dialog-close icon-button" data-action="close-help" aria-label="Close guide">${icon('close')}</button><span class="eyebrow">A GUARDIAN’S FIELD GUIDE</span><h2 id="help-title">Keep the light alive.</h2><p>Your guardian automatically fires at approaching enemies. They attack the crystal when they reach it.</p><div class="help-spells"><p>${icon('fire')} <span><b>Fire Nova · Q</b>Damage enemies near the crystal. 12s cooldown.</span></p><p>${icon('ice')} <span><b>Frost Ward · W</b>Freeze all enemies for 5s. 18s cooldown.</span></p><p>${icon('bolt')} <span><b>Arc Lightning · E</b>Strike up to five enemies. 9s cooldown.</span></p></div><p>Clear a wave to choose an upgrade. Every fifth wave brings the Hollow King. His marked ground attacks deal heavy damage—freeze him and use your spells.</p><p class="help-note">The studio sends local mock events only. Broadcast view opens a separate run for clean 9:16 capture. To capture this run with studio events, crop to the arena. Sound starts after your first tap. Press P to pause.</p><button class="primary-button" data-action="close-help">I’m ready ${icon('arrow')}</button></dialog>
<a class="exit-broadcast" href="./">${icon('external')} Exit broadcast view</a>
`;
