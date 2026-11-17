import { Game } from '../game/engine';
import { GIFTS } from '../game/config';
import type { GiftKind, Skill, Upgrade } from '../game/types';
import type { LiveEvent } from '../integrations/events/types';
import { MockProvider } from '../integrations/mock/MockProvider';
import { SessionBus, type Command } from '../integrations/local/SessionBus';
import { Sound } from '../audio/Sound';
import { icon } from './icons';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const readBest = () => {
  try {
    const value = Number(localStorage.getItem('survival-arena-best'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

/** Minimal audience UI. The full control surface lives in admin.html. */
export class Controller {
  readonly sound = new Sound();
  readonly mock: MockProvider;
  private interval: ReturnType<typeof setInterval>;
  private unsubs: (() => void)[] = [];
  private toastUntil = 0;
  private momentUntil = 0;
  private statusSince = 0;
  private lastStatus = 'ready';
  private lastPublish = 0;
  private likes = 0;
  private abort = new AbortController();
  constructor(
    readonly game: Game,
    private bus: SessionBus,
  ) {
    this.mock = new MockProvider(() => game.state.status === 'running');
    this.mock.subscribe((event) => this.handleEvent(event));
    this.unsubs.push(
      bus.on((message) => {
        if (message.type === 'command') this.command(message.command);
      }),
    );
    this.unsubs.push(
      game.on((event) => {
        if (event.type === 'sound') this.sound.play(event.sound);
        if (event.type === 'boss') this.moment('BOSS!');
        if (event.type === 'defeat')
          try {
            localStorage.setItem('survival-arena-best', String(game.state.best));
          } catch {
            /* Optional persistence. */
          }
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-gift]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          this.sound.unlock();
          this.mock.send('GiftReceived', { gift: button.dataset.gift as GiftKind });
        },
        { signal: this.abort.signal },
      ),
    );
    el('retry').addEventListener('click', () => this.begin(), { signal: this.abort.signal });
    document.addEventListener('pointerdown', () => this.sound.unlock(), {
      once: true,
      signal: this.abort.signal,
    });
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.repeat ||
          (event.target instanceof HTMLElement &&
            /INPUT|SELECT|TEXTAREA/.test(event.target.tagName))
        )
          return;
        const key = event.key.toLowerCase();
        const skill = ({ q: 'nova', w: 'frost', e: 'lightning' } as Record<string, Skill>)[key];
        if (skill) {
          event.preventDefault();
          this.sound.unlock();
          game.skill(skill);
        }
        if (key === 'p') game.state.status === 'running' ? game.pause() : game.resume();
      },
      { signal: this.abort.signal },
    );
    this.interval = setInterval(() => this.render(), 80);
  }
  ready() {
    this.begin();
  }
  private begin() {
    this.game.start(true);
    this.likes = 0;
    el('run-state').hidden = true;
    this.moment('DEFEND THE CRYSTAL', 1500);
    this.render();
  }
  private command(command: Command) {
    switch (command.kind) {
      case 'pause':
        this.game.pause();
        break;
      case 'resume':
        this.game.resume();
        break;
      case 'restart':
        this.begin();
        break;
      case 'mute':
        this.sound.toggle();
        break;
      case 'gift':
        this.mock.send('GiftReceived', { gift: command.gift });
        break;
      case 'skill':
        this.game.skill(command.skill);
        break;
      case 'auto':
        command.enabled ? this.mock.start() : this.mock.stop();
        break;
      case 'crowd':
        this.mock.crowd();
        break;
      case 'event':
        if (this.game.state.status === 'running') this.handleEvent(command.event);
        break;
    }
    this.render();
  }
  private moment(text: string, duration = 1100) {
    el('moment').textContent = text;
    el('moment').hidden = false;
    this.momentUntil = Date.now() + duration;
  }
  private toast(event: LiveEvent, label: string, kind?: GiftKind) {
    const box = el('gift-toast');
    box.replaceChildren();
    const symbol = document.createElement('span');
    symbol.className = 'toast-icon';
    symbol.innerHTML = icon(kind ? GIFTS[kind].icon : 'heart');
    const name = document.createElement('b');
    name.textContent = event.viewer.name;
    const action = document.createElement('span');
    action.textContent = label;
    box.append(symbol, name, action);
    box.hidden = false;
    this.toastUntil = Date.now() + 1900;
  }
  private handleEvent(event: LiveEvent) {
    const s = this.game.state;
    if (s.status !== 'running') return;
    this.bus.send({ type: 'activity', event });
    if (event.type === 'GiftReceived') {
      this.game.gift(event.gift);
      if (event.gift === 'crown') {
        const boss = s.enemies.find((e) => e.kind === 'boss');
        if (boss) boss.viewerName = event.viewer.name;
      }
      this.toast(
        event,
        ({ rose: '+25 HP', ice: 'FROZEN!', meteor: 'METEOR!', crown: 'SUMMONED A BOSS' } as const)[
          event.gift
        ],
        event.gift,
      );
    }
    if (event.type === 'LikeReceived') {
      this.likes += event.count;
      this.game.burst(s.player, '#ff91c7', 12);
      if (this.likes >= 20) {
        this.likes %= 20;
        this.game.skill('lightning');
        this.toast(event, 'LIGHTNING!');
      }
    }
    if (event.type === 'FollowReceived') {
      s.hp = Math.min(s.maxHp, s.hp + 5);
      this.game.burst(s.player, '#fff099', 20);
      this.toast(event, '+5 HP');
    }
    if (event.type === 'ChatMessage') {
      const skill = ({ fire: 'nova', ice: 'frost', bolt: 'lightning' } as Record<string, Skill>)[
        event.message.trim().toLowerCase()
      ];
      if (skill && this.game.skill(skill)) this.toast(event, event.message.trim().toUpperCase());
    }
  }
  private render() {
    const s = this.game.state,
      now = Date.now();
    document.body.dataset.gameStatus = s.status;
    document.body.dataset.wave = String(s.wave);
    el('wave').textContent = String(s.wave);
    el('hp-text').textContent = `${Math.ceil((s.hp / s.maxHp) * 100)}%`;
    el('hp-bar').style.width = `${(s.hp / s.maxHp) * 100}%`;
    const bar = document.querySelector('[role="progressbar"]');
    bar?.setAttribute('aria-valuenow', String(Math.ceil(s.hp)));
    bar?.setAttribute('aria-valuemax', String(s.maxHp));
    el('hud').classList.toggle('critical', s.hp / s.maxHp < 0.3);
    document
      .querySelectorAll<HTMLButtonElement>('[data-gift]')
      .forEach((button) => (button.disabled = s.status !== 'running'));
    if (now > this.toastUntil) el('gift-toast').hidden = true;
    if (now > this.momentUntil) el('moment').hidden = true;
    if (s.status !== this.lastStatus) {
      this.lastStatus = s.status;
      this.statusSince = now;
    }
    if (s.status === 'upgrade' && now - this.statusSince > 850) {
      const blessing: Upgrade = (['power', 'haste', 'vitality'] as const)[(s.wave - 1) % 3];
      this.game.upgrade(blessing);
      this.moment(`WAVE ${s.wave}`);
    }
    const stopped = s.status === 'paused' || s.status === 'gameover';
    el('run-state').hidden = !stopped;
    if (stopped) {
      el('run-message').textContent = s.status === 'paused' ? 'PAUSED' : 'CRYSTAL LOST';
      el('retry').hidden = s.status === 'paused';
    }
    if (s.status === 'gameover' && now - this.statusSince > 4500) this.begin();
    if (now - this.lastPublish > 250) {
      this.lastPublish = now;
      const { status, wave, hp, maxHp, kills, score, gifts, time, freeze } = s;
      this.bus.send({
        type: 'snapshot',
        state: { status, wave, hp, maxHp, kills, score, gifts, time, freeze },
      });
    }
  }
  dispose() {
    clearInterval(this.interval);
    this.abort.abort();
    this.mock.dispose();
    this.unsubs.forEach((fn) => fn());
    this.bus.dispose();
  }
}
