import { Game } from '../game/engine';
import { COOLDOWNS, GIFTS } from '../game/config';
import type { GiftKind, Skill, Upgrade } from '../game/types';
import type { LiveEvent } from '../integrations/events/types';
import { MockProvider } from '../integrations/mock/MockProvider';
import { Sound } from '../audio/Sound';
import { icon } from './icons';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const formatTime = (time: number) =>
  `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
export const readBest = () => {
  try {
    const value = Number(localStorage.getItem('survival-arena-best'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

export class Controller {
  private lastStatus = 'ready';
  private feedCount = 0;
  private viewers = new Set<string>();
  private likes = 0;
  private gifts = 0;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private bossTimer?: ReturnType<typeof setTimeout>;
  private interval: ReturnType<typeof setInterval>;
  private unsubs: (() => void)[] = [];
  private resumeAfterHelp = false;
  readonly sound = new Sound();
  readonly mock: MockProvider;
  constructor(readonly game: Game) {
    this.mock = new MockProvider(() => this.game.state.status === 'running' && !document.hidden);
    el('personal-best').innerHTML = `${game.state.best.toLocaleString()} <span>PTS</span>`;
    this.bind();
    this.interval = setInterval(() => this.render(), 80);
    this.unsubs.push(
      game.on((event) => {
        if (event.type === 'sound') this.sound.play(event.sound);
        if (event.type === 'boss') {
          el('boss-announcement').hidden = false;
          clearTimeout(this.bossTimer);
          this.bossTimer = setTimeout(() => {
            el('boss-announcement').hidden = true;
          }, 3000);
        }
        if (event.type === 'defeat') {
          try {
            localStorage.setItem('survival-arena-best', String(game.state.best));
          } catch {
            /* Optional persistence. */
          }
          el('personal-best').innerHTML = `${game.state.best.toLocaleString()} <span>PTS</span>`;
        }
      }),
      this.mock.subscribe((event) => this.handleEvent(event)),
    );
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        game.pause();
        this.sound.suspend();
      }
    });
    window.addEventListener('pagehide', () => this.mock.stop());
  }
  ready() {
    const start = el<HTMLButtonElement>('start');
    start.disabled = false;
    start.innerHTML = `Enter the arena ${icon('arrow')}`;
  }
  private begin() {
    this.sound.unlock();
    this.game.start();
    this.viewers.clear();
    this.likes = 0;
    this.gifts = 0;
    this.feedCount = 0;
    el('activity-feed').innerHTML =
      '<li class="feed-empty"><span>Your run is LIVE.<small>Send a mock event to join the story.</small></span></li>';
    for (const id of ['viewers', 'likes', 'gift-count']) el(id).textContent = '0';
    el('event-count').textContent = '0 EVENTS';
    el('boss-announcement').hidden = true;
    el('gift-toast').hidden = true;
    clearTimeout(this.bossTimer);
    clearTimeout(this.toastTimer);
    this.render();
  }
  private bind() {
    el('start').addEventListener('click', () => this.begin());
    el('pause').addEventListener('click', () => {
      this.game.pause();
      this.render();
    });
    el('sound').addEventListener('click', () => {
      const muted = this.sound.toggle();
      el('sound').innerHTML = icon(muted ? 'muted' : 'sound');
      el('sound').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    });
    document.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach((button) =>
      button.addEventListener('click', () => {
        this.sound.unlock();
        this.game.skill(button.dataset.skill as Skill);
        this.render();
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-gift]').forEach((button) =>
      button.addEventListener('click', () => {
        this.sound.unlock();
        this.mock.send('GiftReceived', { gift: button.dataset.gift as GiftKind });
        this.render();
      }),
    );
    el('auto-events').addEventListener('click', () => {
      const enabled = el('auto-events').getAttribute('aria-checked') !== 'true';
      el('auto-events').setAttribute('aria-checked', String(enabled));
      if (enabled) this.mock.start();
      else this.mock.stop();
    });
    el('send-event').addEventListener('click', () => {
      this.mock.send(el<HTMLSelectElement>('event-type').value as LiveEvent['type'], {
        message: el<HTMLInputElement>('chat-message').value || undefined,
      });
    });
    el('crowd').addEventListener('click', () => this.mock.crowd());
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) =>
      button.addEventListener('click', () => {
        switch (button.dataset.action) {
          case 'help':
            this.resumeAfterHelp = this.game.state.status === 'running';
            this.game.pause();
            el<HTMLDialogElement>('help-dialog').showModal();
            break;
          case 'close-help':
            el<HTMLDialogElement>('help-dialog').close();
            break;
          case 'studio':
            el('studio-panel').classList.add('open');
            break;
          case 'close-studio':
            el('studio-panel').classList.remove('open');
            el<HTMLButtonElement>('pause').focus();
            break;
        }
        this.render();
      }),
    );
    el('help-dialog').addEventListener('close', () => {
      if (this.resumeAfterHelp) this.game.resume();
      this.resumeAfterHelp = false;
      this.render();
    });
    el('overlay-card').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.action === 'resume') {
        this.sound.unlock();
        this.game.resume();
      }
      if (button.dataset.action === 'restart') this.begin();
      if (button.dataset.upgrade) this.game.upgrade(button.dataset.upgrade as Upgrade);
      this.render();
    });
    document.addEventListener('keydown', (event) => {
      if (
        event.repeat ||
        (event.target instanceof HTMLElement &&
          /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) ||
        el<HTMLDialogElement>('help-dialog').open
      )
        return;
      const key = event.key.toLowerCase();
      if (['q', 'w', 'e', 'p'].includes(key)) event.preventDefault();
      if (key === 'p') {
        this.game.state.status === 'running' ? this.game.pause() : this.game.resume();
      }
      const skill = ({ q: 'nova', w: 'frost', e: 'lightning' } as Record<string, Skill>)[key];
      if (skill) {
        this.sound.unlock();
        this.game.skill(skill);
      }
      this.render();
    });
  }
  private toast(title: string, subtitle: string) {
    const box = el('gift-toast');
    box.replaceChildren();
    const strong = document.createElement('b'),
      small = document.createElement('small');
    strong.textContent = title;
    small.textContent = subtitle;
    box.append(strong, small);
    box.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      box.hidden = true;
    }, 2600);
  }
  private handleEvent(event: LiveEvent) {
    let activity = '',
      title = '';
    switch (event.type) {
      case 'GiftReceived': {
        const gift = GIFTS[event.gift];
        if (!this.game.gift(event.gift)) return;
        this.gifts++;
        activity = `sent a ${gift.name}`;
        title = `${event.viewer.name} sent a ${gift.name}`;
        this.toast(title, gift.effect);
        break;
      }
      case 'ViewerJoined':
        this.viewers.add(event.viewer.id);
        activity = 'joined the arena';
        break;
      case 'ChatMessage':
        activity = event.message;
        this.toast(event.viewer.name, event.message);
        break;
      case 'LikeReceived':
        this.likes += event.count;
        activity = `sent ${event.count} likes`;
        this.game.burst(this.game.state.player, '#efbad1', 10);
        break;
      case 'FollowReceived':
        activity = 'followed the adventure';
        this.game.burst(this.game.state.player, '#dcdea3', 15);
        break;
    }
    this.feedCount++;
    if (this.feedCount === 1) el('activity-feed').replaceChildren();
    const li = document.createElement('li'),
      avatar = document.createElement('span'),
      text = document.createElement('span'),
      name = document.createElement('b'),
      time = document.createElement('time');
    avatar.className = 'feed-avatar';
    avatar.textContent = event.viewer.name.slice(0, 1);
    name.textContent = event.viewer.name;
    text.append(name, document.createTextNode(` ${activity}`));
    time.textContent = 'NOW';
    time.dateTime = new Date(event.at).toISOString();
    li.append(avatar, text, time);
    el('activity-feed').prepend(li);
    while (el('activity-feed').children.length > 25) el('activity-feed').lastElementChild?.remove();
    el('event-count').textContent = `${this.feedCount} EVENTS`;
    el('viewers').textContent = String(this.viewers.size);
    el('likes').textContent = String(this.likes);
    el('gift-count').textContent = String(this.gifts);
  }
  private render() {
    const s = this.game.state,
      playing = s.status === 'running';
    document.body.dataset.gameStatus = s.status;
    el('wave').textContent = String(s.wave).padStart(2, '0');
    el('wave-name').textContent =
      s.wave % 5 === 0
        ? 'THE KING’S REIGN'
        : (['THE AWAKENING', 'SHADOWS GATHER', 'INTO THE DARK', 'THE LAST STAND'][
            (s.wave - 1) % 5
          ] ?? 'THE AWAKENING');
    el('score').textContent = s.score.toLocaleString();
    el('kills').textContent = String(s.kills);
    el('hp-text').textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
    el('hp-bar').style.width = `${(s.hp / s.maxHp) * 100}%`;
    document
      .querySelector('[role="progressbar"]')
      ?.setAttribute('aria-valuenow', String(Math.ceil(s.hp)));
    document.querySelector('[role="progressbar"]')?.setAttribute('aria-valuemax', String(s.maxHp));
    el('timer').textContent = formatTime(s.time);
    el('wave-progress-label').textContent =
      s.freeze > 0
        ? `FROZEN · ${s.freeze.toFixed(1)}s`
        : `${s.spawnRemaining + s.enemies.length} enemies remaining`;
    const boss = s.enemies.find((e) => e.kind === 'boss');
    el('boss-health').hidden = !boss;
    if (boss) {
      el('boss-hp').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
      el('boss-phase').textContent = boss.hp < boss.maxHp / 2 ? 'ENRAGED' : 'PHASE I';
    }
    el<HTMLButtonElement>('pause').disabled = !playing;
    document.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach((button) => {
      const key = button.dataset.skill as Skill,
        remaining = s.cooldowns[key];
      button.disabled = !playing || remaining > 0;
      button.classList.toggle('cooling', remaining > 0);
      button.style.setProperty('--cooldown', String(remaining / COOLDOWNS[key]));
      const text = button.querySelector('.cooldown');
      if (text) text.textContent = `${Math.ceil(remaining)}`;
      button.setAttribute(
        'aria-label',
        `${key === 'nova' ? 'Fire Nova' : key === 'frost' ? 'Frost Ward' : 'Arc Lightning'}${remaining > 0 ? `, ready in ${Math.ceil(remaining)} seconds` : ', ready'}`,
      );
    });
    document
      .querySelectorAll<HTMLButtonElement>('[data-gift],#send-event,#crowd')
      .forEach((button) => {
        button.disabled = !playing;
      });
    const overlay = el('game-overlay');
    overlay.hidden = playing;
    if (this.lastStatus === s.status) return;
    this.lastStatus = s.status;
    overlay.classList.toggle('ready-overlay', s.status === 'ready');
    const card = el('overlay-card');
    if (s.status === 'paused')
      card.innerHTML = `<span class="overlay-rune">${icon('pause')}</span><small class="eyebrow">TAKE A BREATH, GUARDIAN</small><h2>The light can wait.</h2><p>Your run is paused.<br>Return when you’re ready.</p><button class="primary-button" data-action="resume">Return to the arena ${icon('play')}</button>`;
    if (s.status === 'upgrade')
      card.innerHTML = `<span class="overlay-rune">${icon('crown')}</span><small class="eyebrow">WAVE ${s.wave} SECURED · ${s.xp} XP</small><h2>A little stronger.</h2><p>The darkness returns. Choose your blessing.</p><div class="upgrade-list"><button class="upgrade-choice" data-upgrade="power">${icon('bolt')}<span><strong>Arcane Power</strong><small>+7 damage to every attack</small></span>${icon('chevron')}</button><button class="upgrade-choice" data-upgrade="vitality">${icon('heart')}<span><strong>Living Crystal</strong><small>+20 max health · restore 35 health</small></span>${icon('chevron')}</button><button class="upgrade-choice" data-upgrade="haste">${icon('sword')}<span><strong>Quickening</strong><small>Attack 12% faster</small></span>${icon('chevron')}</button></div><span class="start-note">NEXT: WAVE ${s.wave + 1}${(s.wave + 1) % 5 === 0 ? ' · BOSS INCOMING' : ''}</span>`;
    if (s.status === 'gameover')
      card.innerHTML = `<span class="overlay-rune">${icon('crystal')}</span><small class="eyebrow">THE CRYSTAL HAS FALLEN</small><h2>Even light rests.</h2><p>But every guardian gets another dawn.</p><div class="results-stats"><div><b>${s.score.toLocaleString()}</b><span>POINTS</span></div><div><b>${s.wave}</b><span>WAVE</span></div><div><b>${s.kills}</b><span>VANQUISHED</span></div></div><button class="primary-button" data-action="restart">Rise again ${icon('arrow')}</button><span class="start-note">SURVIVED ${formatTime(s.time)} · ${s.xp} XP · BEST ${s.best.toLocaleString()}</span>`;
  }
  dispose() {
    clearInterval(this.interval);
    clearTimeout(this.toastTimer);
    clearTimeout(this.bossTimer);
    this.mock.dispose();
    this.unsubs.forEach((fn) => fn());
  }
}
