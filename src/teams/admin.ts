import { TeamClient, post } from './Client';
import { ConfirmedToggle } from './ConfirmedToggle';
import { GIFTS, type AdminAction, type Team, type TeamGift } from './contracts';
import './style.css';

document.getElementById('app')!.innerHTML =
  `<main class="control-room"><header class="control-heading"><div><small>TEAM ARENA</small><h1>Control room</h1></div><a href="/teams.html" target="team-arena">Open game ↗</a></header><p class="control-intro">Red vs blue · server-synchronized viewers and events</p><section id="login-panel" class="control-card"><h2>Admin access</h2><form id="login"><label for="admin-key">Admin key</label><div class="login-row"><input id="admin-key" type="password" autocomplete="current-password" required placeholder="Key from your server configuration"><button>Sign in</button></div></form></section><div id="admin-error" class="control-error" role="status" hidden></div><section id="controls" hidden><div class="control-status"><span id="server-status">Connecting…</span><b id="control-round">Round 1</b><span id="control-players">0 players</span></div><section class="control-card"><div class="control-row"><h2>Round</h2><button id="logout" class="subtle">Sign out</button></div><div class="control-buttons"><button id="pause">Pause</button><button id="resume">Resume</button><button id="restart">New round</button><button id="crowd">+8 viewers</button></div><label class="simulation-switch"><input type="checkbox" id="autoplay"> Automatic demo events</label></section><section class="control-card"><h2>Simulate a viewer</h2><div class="viewer-fields"><label>Viewer ID<input id="viewer-id" value="demo-host" maxlength="100"></label><label>Display name<input id="viewer-name" value="Luna" maxlength="32"></label><label>Team<select id="viewer-team"><option value="red">Red</option><option value="blue">Blue</option></select></label></div><div class="control-buttons"><button id="viewer-join">Join team</button><button id="viewer-like">20 likes</button><button id="viewer-follow">Follow / heal</button></div><div class="gift-actions">${Object.entries(
    GIFTS,
  )
    .map(
      ([id, gift]) =>
        `<button data-team-gift="${id}"><strong>${gift.name}</strong><small>${gift.description}</small></button>`,
    )
    .join(
      '',
    )}</div><form id="chat-form" class="chat-form"><input id="chat" placeholder="red, blue, 1 or 2" aria-label="Viewer chat" maxlength="200"><button>Send chat</button></form></section><section class="control-card"><h2>Participants <span id="roster-count"></span></h2><div id="roster" class="roster"></div></section><section class="control-card"><h2>Event feed</h2><ol id="event-feed" class="event-feed"></ol></section><p class="control-intro">API input is ready at <code>POST /api/teams/events</code>. The event bearer key stays on the server. Connect your TikTok event provider to this endpoint using the documented event contract.</p></section></main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const client = new TeamClient();
const autoplay = new ConfirmedToggle();
let autoplayTimeout: ReturnType<typeof setTimeout> | undefined;
let signedIn = false,
  lastActivity = 0;
function error(message: string) {
  el('admin-error').textContent = message;
  el('admin-error').hidden = !message;
}
function session(authenticated: boolean) {
  signedIn = authenticated;
  el('controls').hidden = !authenticated;
  el('login-panel').hidden = authenticated;
  renderAutoplay();
}
function renderAutoplay() {
  const input = el<HTMLInputElement>('autoplay');
  input.checked = autoplay.value;
  input.disabled = !signedIn || !client.connected || autoplay.pending;
  input.setAttribute('aria-busy', String(autoplay.pending));
  if (!autoplay.pending) {
    clearTimeout(autoplayTimeout);
    autoplayTimeout = undefined;
  }
}
async function action(input: AdminAction) {
  try {
    await post('/api/teams/admin/actions', input);
    error('');
  } catch (e) {
    error(e instanceof Error ? e.message : 'Request failed');
  }
}
void fetch('/api/teams/admin/session')
  .then((r) => r.json())
  .then((s: { authenticated: boolean }) => session(s.authenticated))
  .catch(() => error('The game server is unavailable'));
el('login').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await post('/api/teams/admin/login', { key: el<HTMLInputElement>('admin-key').value });
    el<HTMLInputElement>('admin-key').value = '';
    session(true);
    error('');
  } catch (e) {
    error(e instanceof Error ? e.message : 'Sign in failed');
  }
});
el('logout').addEventListener('click', async () => {
  try {
    await post('/api/teams/admin/logout', {});
    session(false);
  } catch {
    error('Unable to sign out. Check your connection.');
  }
});
el('pause').addEventListener('click', () => action({ type: 'pause', paused: true }));
el('resume').addEventListener('click', () => action({ type: 'pause', paused: false }));
el('restart').addEventListener('click', () => action({ type: 'restart' }));
el('crowd').addEventListener('click', () => action({ type: 'crowd', count: 8 }));
el('autoplay').addEventListener('change', async () => {
  const enabled = el<HTMLInputElement>('autoplay').checked;
  const revision = autoplay.request(enabled);
  if (revision === undefined) return;
  renderAutoplay();
  autoplayTimeout = setTimeout(() => {
    autoplay.cancel(revision);
    renderAutoplay();
    error('The server did not confirm the setting. Check your connection.');
  }, 8000);
  try {
    await post('/api/teams/admin/actions', { type: 'autoplay', enabled });
    autoplay.acknowledge(revision);
  } catch (e) {
    autoplay.cancel(revision);
    error(e instanceof Error ? e.message : 'Unable to change automatic events');
  }
  renderAutoplay();
});
const viewer = () => ({
  id: el<HTMLInputElement>('viewer-id').value.trim(),
  name: el<HTMLInputElement>('viewer-name').value.trim(),
});
const team = () => el<HTMLSelectElement>('viewer-team').value as Team;
el('viewer-join').addEventListener('click', () =>
  action({
    type: 'event',
    event: { id: crypto.randomUUID(), type: 'join', viewer: viewer(), team: team() },
  }),
);
el('viewer-like').addEventListener('click', () =>
  action({
    type: 'event',
    event: { id: crypto.randomUUID(), type: 'like', viewer: viewer(), count: 20 },
  }),
);
el('viewer-follow').addEventListener('click', () =>
  action({ type: 'event', event: { id: crypto.randomUUID(), type: 'follow', viewer: viewer() } }),
);
document.querySelectorAll<HTMLButtonElement>('[data-team-gift]').forEach((button) =>
  button.addEventListener('click', () =>
    action({
      type: 'event',
      event: {
        id: crypto.randomUUID(),
        type: 'gift',
        viewer: viewer(),
        team: team(),
        gift: button.dataset.teamGift as TeamGift,
        amount: 1,
      },
    }),
  ),
);
el('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await action({
    type: 'event',
    event: {
      id: crypto.randomUUID(),
      type: 'chat',
      viewer: viewer(),
      message: el<HTMLInputElement>('chat').value,
    },
  });
});
client.onState((state) => {
  el('control-round').textContent =
    `Round ${state.round} · ${state.paused ? 'paused' : state.phase}`;
  el('control-players').textContent =
    `${state.fighters.filter((f) => !f.temporary).length} viewers`;
  autoplay.receive(state.autoplay);
  renderAutoplay();
  const roster = el('roster');
  roster.replaceChildren();
  for (const fighter of state.fighters.filter((f) => !f.temporary)) {
    const row = document.createElement('div');
    row.className = `roster-person ${fighter.team}`;
    const name = document.createElement('strong');
    name.textContent = fighter.name;
    const detail = document.createElement('span');
    detail.textContent = `${fighter.team.toUpperCase()} · ${fighter.kills} kills · ${Math.ceil(fighter.hp)} HP`;
    row.append(name, detail);
    roster.append(row);
  }
  el('roster-count').textContent = String(roster.children.length);
  if (state.activity[0]?.id !== lastActivity) {
    lastActivity = state.activity[0]?.id ?? 0;
    el('event-feed').replaceChildren();
    for (const event of state.activity) {
      const li = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = event.name;
      li.append(name, document.createTextNode(` ${event.text}`));
      el('event-feed').append(li);
    }
  }
});
const monitor = setInterval(() => {
  el('server-status').textContent = client.connected ? '● Server connected' : '○ Reconnecting';
  document.body.dataset.connected = String(client.connected);
  renderAutoplay();
  document
    .querySelectorAll<HTMLButtonElement>('#controls button')
    .forEach((b) => (b.disabled = !client.connected || !signedIn));
}, 400);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearInterval(monitor);
    clearTimeout(autoplayTimeout);
    client.dispose();
  });
