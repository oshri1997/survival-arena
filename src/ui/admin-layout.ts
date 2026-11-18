import { GIFTS } from '../game/config';
import { icon } from './icons';
export const adminLayout = () => `
<main class="admin-shell">
  <header class="admin-heading"><div><span class="admin-eyebrow">SURVIVAL ARENA</span><h1>Broadcast controls</h1></div><a id="open-game" class="admin-primary" href="/" target="survival-arena">Open game ${icon('external')}</a></header>
  <p class="admin-notice">Controls this browser only. Keep the game open in another tab or window. All events are simulated.</p>
  <section class="admin-status"><span id="connection" role="status">Waiting for game…</span><b id="admin-wave">Wave —</b><span id="admin-health">— health</span><span id="admin-kills">0 kills</span></section>
  <section class="admin-section"><h2>Run</h2><div class="admin-actions"><button data-command="pause">${icon('pause')} Pause</button><button data-command="resume">${icon('play')} Resume</button><button data-command="restart">Restart</button><button data-command="mute">${icon('sound')} Toggle sound</button></div></section>
  <section class="admin-section"><h2>Send a simulated gift</h2><div class="admin-gifts">${Object.entries(
    GIFTS,
  )
    .map(
      ([kind, gift]) =>
        `<button data-gift="${kind}" style="--gift-color:${gift.color}">${icon(gift.icon)}<strong>${gift.name}</strong><small>${gift.effect}</small></button>`,
    )
    .join('')}</div></section>
  <section class="admin-section"><h2>Cast a spell</h2><div class="admin-actions"><button data-skill="nova">${icon('fire')} Fire Nova</button><button data-skill="frost">${icon('ice')} Frost Ward</button><button data-skill="lightning">${icon('bolt')} Arc Lightning</button></div></section>
  <section class="admin-section"><h2>Crowd simulation</h2><label class="auto-control"><input type="checkbox" id="auto-events"> Send an event every 5.5 seconds</label><div class="admin-event-form"><select id="event-type" aria-label="Mock event type"><option value="ViewerJoined">Viewer joins</option><option value="ChatMessage">Chat message</option><option value="LikeReceived">20 likes</option><option value="FollowReceived">New follower</option></select><input id="chat-message" aria-label="Mock chat message" maxlength="120" placeholder="Try: fire, ice or bolt"><button id="send-event">Send event</button><button id="crowd">${icon('users')} Simulate a crowd</button></div></section>
  <section class="admin-section"><h2>Activity <span id="event-count">0</span></h2><ol id="activity-feed" class="activity-feed" aria-label="Simulated activity"></ol></section>
  <p class="admin-notice">The viewer screen starts automatically. Waves and upgrades continue without menus. Keyboard: Q fire · W ice · E lightning · P pause. Controls sync between tabs on this device; no live TikTok connector is enabled.</p>
</main>`;
