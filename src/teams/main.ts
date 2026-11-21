import Phaser from 'phaser';
import { TeamClient, post } from './Client';
import { LocalDemo } from './LocalDemo';
import type { Team } from './contracts';
import { TeamScene } from './TeamScene';
import './style.css';
import { Sound } from '../audio/Sound';

document.getElementById('app')!.innerHTML =
  `<main class="battle-screen"><div id="team-game" role="img" aria-label="Red and blue viewer avatars battle for territory"></div><header class="team-scoreboard"><div class="score red"><span>RED</span><b id="red-share">50<span>%</span></b><small id="red-count">0 players</small></div><div class="round-info"><span id="mode">DEMO</span><b id="clock">2:00</b><small id="round">ROUND 1</small></div><div class="score blue"><span>BLUE</span><b id="blue-share">50<span>%</span></b><small id="blue-count">0 players</small></div><div class="territory-track"><i id="territory-red"></i></div></header><div id="team-result" class="team-result" hidden><span>ROUND COMPLETE</span><strong id="winner"></strong><small id="next-round"></small></div><div id="team-notice" class="team-notice" role="status">Connecting to the arena…</div><footer class="join-controls"><span class="join-hint" id="join-hint">CHOOSE YOUR SIDE</span><div><button data-team="red" class="join-red">JOIN RED <span>1</span></button><button data-team="blue" class="join-blue">JOIN BLUE <span>2</span></button></div><small>Chat <b>red</b> or <b>blue</b> to join your team</small></footer></main>`;
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
let activity = 0,
  noticeUntil = 0;
client.onState((state) => {
  document.body.dataset.connected = 'true';
  document.body.dataset.phase = state.paused ? 'paused' : state.phase;
  document.getElementById('red-share')!.innerHTML =
    `${Math.round(state.territory * 100)}<span>%</span>`;
  document.getElementById('blue-share')!.innerHTML =
    `${100 - Math.round(state.territory * 100)}<span>%</span>`;
  for (const team of ['red', 'blue'] as const)
    document.getElementById(`${team}-count`)!.textContent =
      `${state.fighters.filter((f) => f.team === team && !f.temporary).length} players`;
  document.getElementById('territory-red')!.style.width = `${state.territory * 100}%`;
  document.getElementById('clock')!.textContent = state.paused
    ? 'Ⅱ'
    : `${Math.floor(Math.ceil(state.remaining) / 60)}:${String(Math.ceil(state.remaining) % 60).padStart(2, '0')}`;
  document.getElementById('round')!.textContent = `ROUND ${state.round}`;
  document.getElementById('mode')!.textContent = localDemo
    ? 'LOCAL DEMO'
    : state.autoplay || state.demoJoin
      ? 'DEMO LIVE'
      : 'TEAM ARENA';
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
  const latest = state.activity[0];
  if (latest && latest.id > activity) {
    activity = latest.id;
    const notice = document.getElementById('team-notice')!;
    notice.replaceChildren();
    const strong = document.createElement('b');
    strong.textContent = latest.name;
    notice.append(strong, document.createTextNode(` ${latest.text}`));
    notice.className = `team-notice ${latest.team ?? ''}`;
    notice.hidden = false;
    noticeUntil = Date.now() + 2200;
  }
});
document.querySelectorAll<HTMLButtonElement>('[data-team]').forEach((button) =>
  button.addEventListener('click', async () => {
    try {
      if (client instanceof LocalDemo) client.join(button.dataset.team as Team);
      else {
        const result = await post('/api/teams/join', { team: button.dataset.team, name: 'You' });
        if (result.status === 'queued') {
          document.getElementById('join-hint')!.textContent = 'REGISTERED · YOUR TURN IS COMING';
          return;
        }
      }
      document.getElementById('join-hint')!.textContent =
        `YOU’RE ON ${button.dataset.team!.toUpperCase()}`;
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
