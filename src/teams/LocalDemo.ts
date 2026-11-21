import { Battle } from './Battle';
import type { BattleFeed } from './Client';
import type { BattleSnapshot, Team, TeamGift } from './contracts';

/** Explicit, isolated static-host demo. Production teams.html always uses the real server. */
export class LocalDemo implements BattleFeed {
  connected = true;
  private battle = new Battle();
  private listeners = new Set<(state: BattleSnapshot) => void>();
  private timer: ReturnType<typeof setInterval>;
  private elapsed = 0;
  private sequence = 0;
  private lastTime = performance.now();
  private frame = 0;
  constructor() {
    const names = [
      'Luna',
      'Kai',
      'Nora',
      'Leo',
      'Maya',
      'Ari',
      'Owl',
      'Nova',
      'Ember',
      'Storm',
      'River',
      'Jade',
      'Milo',
      'Vega',
      'Sage',
      'Echo',
      'Atlas',
      'Ruby',
      'Skye',
      'Rex',
      'Kira',
      'Finn',
      'Ivy',
      'Zane',
    ];
    names.forEach((name, i) =>
      this.battle.apply({
        id: `seed-${i}`,
        type: 'join',
        viewer: { id: `demo-${i}`, name },
        team: i % 2 ? 'blue' : 'red',
      }),
    );
    this.battle.state.autoplay = true;
    this.timer = setInterval(() => {
      const now = performance.now(),
        dt = Math.min(0.5, (now - this.lastTime) / 1000);
      this.lastTime = now;
      for (let remaining = dt; remaining > 0; remaining -= 0.05)
        this.battle.update(Math.min(0.05, remaining));
      this.elapsed += dt;
      if (this.elapsed >= 5 && this.battle.state.phase === 'battle') {
        this.elapsed = 0;
        const fighters = this.battle.state.fighters.filter((f) => !f.temporary);
        const owner = fighters[Math.floor(Math.random() * fighters.length)];
        const gift: TeamGift = (['shield', 'meteor', 'boost', 'reinforce'] as const)[
          this.sequence % 4
        ];
        this.battle.apply({
          id: `sim-${++this.sequence}`,
          type: 'gift',
          viewer: { id: owner.ownerId, name: owner.name },
          gift,
          amount: 1,
        });
      }
      if (++this.frame % 2 === 0) this.emit();
    }, 50);
  }
  get state(): BattleSnapshot {
    return { ...this.battle.state, connected: true, demoJoin: true };
  }
  join(team: Team) {
    const result = this.battle.apply({
      id: `touch-${++this.sequence}`,
      type: 'join',
      viewer: { id: 'demo-you', name: 'You' },
      team,
    });
    if (!result.accepted) throw new Error(result.reason);
    this.emit();
  }
  private emit() {
    this.listeners.forEach((listener) => listener(this.state));
  }
  onState(listener: (state: BattleSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispose() {
    clearInterval(this.timer);
    this.connected = false;
    this.listeners.clear();
  }
}
