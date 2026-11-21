import Phaser from 'phaser';
import { TeamClient, post } from './Client';
import { LocalDemo } from './LocalDemo';
import { FEATURED_GIFTS } from './FeaturedGifts';
import {
  GIFTS,
  hasTeamPower,
  ROUND_SECONDS,
  TEAM_RALLY_LIKES,
  type BattleSnapshot,
  type Team,
} from './contracts';
import { TeamScene } from './TeamScene';
import './style.css';
import { Sound } from '../audio/Sound';

document.getElementById('app')!.innerHTML =
  `<main class="battle-screen"><div id="team-game" role="img" aria-label="Red and blue viewer avatars battle for territory"></div><header class="team-scoreboard"><div class="score red"><span>RED <i class="team-power" id="red-power" hidden>POWER ×2</i></span><b id="red-share">50<span>%</span></b><small id="red-count">0 players</small><small class="team-rally" id="red-rally" hidden></small></div><div class="round-info"><span id="mode">DEMO</span><b id="clock">${Math.floor(ROUND_SECONDS / 60)}:00</b><small id="round">ROUND 1</small></div><div class="score blue"><span>BLUE <i class="team-power" id="blue-power" hidden>POWER ×2</i></span><b id="blue-share">50<span>%</span></b><small id="blue-count">0 players</small><small class="team-rally" id="blue-rally" hidden></small></div><div class="territory-track"><i id="territory-red"></i></div></header><details class="gift-guide" open><summary>Gift effects</summary><ul id="gift-guide-items"></ul></details><div id="team-result" class="team-result" hidden><span>ROUND COMPLETE</span><strong id="winner"></strong><small id="next-round"></small></div><div id="team-notice" class="team-notice" role="status">Connecting to the arena…</div><footer class="join-controls"><span class="join-hint" id="join-hint">CHOOSE YOUR SIDE</span><span class="join-hint viewer-welcome" id="viewer-welcome" role="status" hidden></span><div><button data-team="red" class="join-red">JOIN RED <span>1</span></button><button data-team="blue" class="join-blue">JOIN BLUE <span>2</span></button></div><small>Chat <b>red</b> or <b>blue</b> to join · <b>!power</b> for your next upgrade</small></footer></main>`;
const giftGuide = document.getElementById('gift-guide-items')!;
let displayedGiftOverrides = '';
function renderGiftGuide(overrides: BattleSnapshot['giftOverrides'] = {}) {
  const key = JSON.stringify(overrides);
  if (key === displayedGiftOverrides) return;
  displayedGiftOverrides = key;
  giftGuide.innerHTML = FEATURED_GIFTS.map((gift) => {
    const effect = GIFTS[overrides[gift.id]] ?? GIFTS[gift.action];
    return `<li data-live-gift="${gift.id}" title="${effect.description}"><span class="gift-card-icon" aria-hidden="true"><img src="/assets/gifts/${gift.id}.webp" alt=""><span hidden>${gift.symbol}</span></span><span><b>${gift.name}</b><small aria-label="${effect.description}">${effect.short}</small></span></li>`;
  }).join('');
  giftGuide.querySelectorAll('img').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        img.hidden = true;
        (img.nextElementSibling as HTMLElement).hidden = false;
      },
      { once: true },
    );
  });
}
renderGiftGuide();
const localDemo = document.body.dataset.demo === 'local';
const client = localDemo ? new LocalDemo() : new TeamClient();
const sound = new Sound();
const unlockAudio = () => sound.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'm') sound.toggle();
});
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'team-game',
  width: innerWidth,
  height: innerHeight,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  backgroundColor: '#15223a',
  render: { antialias: true, powerPreference: 'low-power' },
  scene: [new TeamScene(client, sound)],
  audio: { noAudio: true },
});
const height = () =>
  document.documentElement.style.setProperty(
    '--team-height',
    `${visualViewport?.height || innerHeight}px`,
  );
height();
window.addEventListener('resize', height);
visualViewport?.addEventListener('resize', height);
const resize = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  if (
    game.scale &&
    width > 0 &&
    height > 0 &&
    (game.scale.width !== Math.round(width) || game.scale.height !== Math.round(height))
  )
    game.scale.resize(Math.round(width), Math.round(height));
});
resize.observe(document.getElementById('team-game')!);
const viewerWelcome = document.getElementById('viewer-welcome')!;
const joinHint = document.getElementById('join-hint')!;
let activity = 0,
  noticeUntil = 0,
  giftNoticeUntil = 0,
  welcomeUntil = 0;
let ownViewerId: string | undefined;
let waitingForTeam: Team | undefined;
const clearWelcome = () => {
  viewerWelcome.hidden = true;
  joinHint.hidden = false;
  welcomeUntil = 0;
};
client.onState((state) => {
  const waiting = state.live === 'waiting';
  renderGiftGuide(state.giftOverrides);
  document.body.dataset.connected = 'true';
  document.body.dataset.phase = state.paused ? 'paused' : state.phase;
  if (ownViewerId) {
    const ownFighter = state.fighters.find((f) => !f.temporary && f.ownerId === ownViewerId);
    if (
      ownFighter &&
      (!waitingForTeam || (state.phase === 'battle' && ownFighter.team === waitingForTeam))
    ) {
      waitingForTeam = undefined;
      joinHint.textContent = `YOU’RE ON ${ownFighter.team.toUpperCase()}`;
    } else joinHint.textContent = 'REGISTERED · YOUR TURN IS COMING';
  }
  document.getElementById('red-share')!.innerHTML =
    `${Math.round(state.territory * 100)}<span>%</span>`;
  document.getElementById('blue-share')!.innerHTML =
    `${100 - Math.round(state.territory * 100)}<span>%</span>`;
  for (const team of ['red', 'blue'] as const) {
    document.getElementById(`${team}-count`)!.textContent =
      `${state.fighters.filter((f) => f.team === team && !f.temporary).length} players`;
    document.getElementById(`${team}-power`)!.hidden =
      state.phase !== 'battle' || !hasTeamPower(state, team);
    const rally = document.getElementById(`${team}-rally`)!;
    rally.hidden = waiting || state.phase !== 'battle';
    rally.textContent = `♥ ${state.rallyLikes?.[team] ?? 0}/${TEAM_RALLY_LIKES}`;
    rally.title = `Heal the team every ${TEAM_RALLY_LIKES} likes`;
  }
  document.getElementById('territory-red')!.style.width = `${state.territory * 100}%`;
  document.getElementById('clock')!.textContent = waiting
    ? '—'
    : state.paused
      ? 'Ⅱ'
      : `${Math.floor(Math.ceil(state.remaining) / 60)}:${String(Math.ceil(state.remaining) % 60).padStart(2, '0')}`;
  document.getElementById('round')!.textContent = waiting ? '' : `ROUND ${state.round}`;
  document.getElementById('mode')!.textContent = waiting
    ? 'WAITING FOR LIVE'
    : localDemo
      ? 'LOCAL DEMO'
      : state.autoplay || state.demoJoin
        ? 'DEMO LIVE'
        : 'TEAM ARENA';
  document.querySelector<HTMLElement>('.join-controls')!.hidden = waiting;
  if (waiting) {
    noticeUntil = giftNoticeUntil = 0;
    clearWelcome();
    document.getElementById('team-notice')!.hidden = true;
  }
  document.getElementById('team-result')!.hidden = state.phase !== 'result';
  document.getElementById('winner')!.textContent =
    state.winner === 'draw' ? 'DRAW' : `${state.winner?.toUpperCase()} WINS`;
  document.getElementById('team-result')!.className = `team-result ${state.winner ?? ''}`;
  document.getElementById('next-round')!.textContent =
    `Next round in ${Math.ceil(state.remaining)}`;
  document
    .querySelectorAll<HTMLButtonElement>('[data-team]')
    .forEach(
      (b) =>
        (b.disabled = !state.demoJoin || (client instanceof LocalDemo && state.phase === 'result')),
    );
  const recent = state.activity.filter((item) => item.id > activity);
  if (!recent.length) return;
  activity = recent[0].id;
  const now = Date.now();
  const viewerPrompt = (item: (typeof recent)[number]) =>
    item.kind === 'welcome' || item.kind === 'power';
  const arrival = recent.find(viewerPrompt);
  if (arrival && !waiting) {
    viewerWelcome.textContent = `${arrival.name} · ${arrival.text}`;
    viewerWelcome.hidden = false;
    joinHint.hidden = true;
    welcomeUntil = now + 4000;
  }
  const gift = recent.find((item) => item.kind === 'gift');
  const latest = gift ?? recent.find((item) => !viewerPrompt(item));
  if (!latest || (!gift && now < giftNoticeUntil)) return;
  const notice = document.getElementById('team-notice')!;
  notice.replaceChildren();
  const strong = document.createElement('b');
  strong.textContent = latest.name;
  const effect = latest.gift && GIFTS[latest.gift];
  if (effect) {
    const icon = document.createElement('img');
    icon.src = effect.image;
    icon.alt = '';
    const line = document.createElement('span');
    line.append(strong, document.createTextNode(` ${latest.text}`));
    const description = document.createElement('small');
    description.textContent = effect.description;
    line.append(description);
    notice.append(icon, line);
  } else notice.append(strong, document.createTextNode(` ${latest.text}`));
  notice.className = ['team-notice', latest.team, latest.kind].filter(Boolean).join(' ');
  notice.hidden = false;
  noticeUntil = now + (gift ? 3000 : 2200);
  if (gift) giftNoticeUntil = noticeUntil;
});
document.querySelectorAll<HTMLButtonElement>('[data-team]').forEach((button) =>
  button.addEventListener('click', async () => {
    try {
      if (client instanceof LocalDemo) client.join(button.dataset.team as Team);
      else {
        const result = await post('/api/teams/join', { team: button.dataset.team, name: 'You' });
        ownViewerId = result.viewerId;
        waitingForTeam = result.status === 'queued' ? (button.dataset.team as Team) : undefined;
        if (result.status === 'queued') {
          joinHint.textContent = 'REGISTERED · YOUR TURN IS COMING';
          return;
        }
      }
      joinHint.textContent = `YOU’RE ON ${button.dataset.team!.toUpperCase()}`;
    } catch (error) {
      document.getElementById('team-notice')!.hidden = false;
      document.getElementById('team-notice')!.textContent =
        error instanceof Error ? error.message : 'Unable to join';
      noticeUntil = Date.now() + 3000;
    }
  }),
);
const monitor = setInterval(() => {
  const notice = document.getElementById('team-notice')!;
  if (welcomeUntil && Date.now() > welcomeUntil) clearWelcome();
  if (!client.connected) {
    notice.hidden = false;
    notice.textContent = 'Reconnecting to the arena…';
    document.body.dataset.connected = 'false';
  } else if (Date.now() > noticeUntil) notice.hidden = true;
}, 300);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearInterval(monitor);
    client.dispose();
    resize.disconnect();
    window.removeEventListener('resize', height);
    visualViewport?.removeEventListener('resize', height);
    game.destroy(true);
  });
