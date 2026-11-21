import { MAX_FIGHTERS, ROUND_SECONDS, WORLD } from './contracts';
import type { AudienceEvent, BattleEffect, BattleState, Fighter, Team, Viewer } from './contracts';
import { Patrol } from './Patrol';
import { FIELD, territoryRange } from './territory';

export interface EventResult {
  accepted: boolean;
  reason?: string;
  status?: 'queued' | 'applied' | 'cosmetic';
  details?: { requested: number; spawned?: number; secondsAdded?: number; targets?: number };
}
const opposite = (team: Team): Team => (team === 'red' ? 'blue' : 'red');
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

/** Server-owned game rules. The browser interpolates snapshots and renders effects. */
export class Battle {
  state: BattleState;
  private nextFighter = 0;
  private patrol: Patrol;
  constructor(
    private random: () => number = Math.random,
    restored?: BattleState,
  ) {
    this.patrol = new Patrol(this.random);
    this.state = restored ?? {
      round: 1,
      remaining: ROUND_SECONDS,
      phase: 'battle',
      winner: null,
      paused: false,
      autoplay: false,
      territory: 0.5,
      scores: { red: 0, blue: 0 },
      shields: { red: 0, blue: 0 },
      boosts: { red: 0, blue: 0 },
      likes: { red: 0, blue: 0 },
      fighters: [],
      effects: [],
      activity: [],
      sequence: 0,
    };
    this.nextFighter = Math.max(
      0,
      ...this.state.fighters.map((f) => Number(f.id.replace('fighter-', '')) || 0),
    );
    this.patrol.constrain(this.state.fighters, this.state.territory, this.state.round);
  }
  private effect(effect: Omit<BattleEffect, 'id'>) {
    this.state.effects.push({ ...effect, id: ++this.state.sequence });
    if (this.state.effects.length > 90) this.state.effects.shift();
  }
  private announce(name: string, text: string, team?: Team) {
    this.state.activity.unshift({ id: ++this.state.sequence, name, text, team });
    this.state.activity = this.state.activity.slice(0, 20);
  }
  private position(team: Team) {
    const y = FIELD.top + this.random() * (FIELD.bottom - FIELD.top);
    const range = territoryRange(team, y, this.state.territory, this.state.round);
    return {
      x: range.min + this.random() * (range.max - range.min),
      y,
    };
  }
  private create(viewer: Viewer, team: Team, temporary = false): Fighter {
    return {
      id: `fighter-${++this.nextFighter}`,
      ownerId: viewer.id,
      name: viewer.name,
      avatar: viewer.avatar,
      team,
      ...this.position(team),
      hp: 100,
      maxHp: 100,
      level: 1,
      kills: 0,
      cooldown: this.random() * 0.7,
      respawn: 0,
      temporary,
    };
  }
  acknowledge(viewer: Viewer, text: string, team?: Team) {
    this.announce(viewer.name, text, team);
    if (team) this.effect({ type: 'boost', team, x: team === 'red' ? 90 : 390, y: 400 });
  }
  replaceRoster(viewers: { viewer: Viewer; team: Team }[]) {
    this.state.fighters = viewers.map(({ viewer, team }) => this.create(viewer, team));
    this.patrol.reset();
  }
  apply(event: AudienceEvent, supporterTeam?: Team): EventResult {
    if (this.state.phase !== 'battle')
      return { accepted: false, reason: 'The next round starts shortly' };
    if (event.type === 'viewerJoined') {
      this.announce(event.viewer.name, 'arrived · chat red or blue');
      return { accepted: true };
    }
    const owner = this.state.fighters.find((f) => f.ownerId === event.viewer.id && !f.temporary);
    const keyword = event.type === 'chat' ? event.message.trim().toLowerCase() : '';
    const team =
      event.type === 'join'
        ? event.team
        : keyword === 'red' || keyword === '1'
          ? 'red'
          : keyword === 'blue' || keyword === '2'
            ? 'blue'
            : undefined;
    if (team) {
      if (owner) {
        owner.name = event.viewer.name;
        owner.avatar = event.viewer.avatar;
        if (owner.team !== team) {
          this.state.fighters = this.state.fighters.filter(
            (f) => f.ownerId !== owner.ownerId || !f.temporary,
          );
          owner.team = team;
          Object.assign(owner, this.position(team));
          // Changing a chat keyword must not heal a fighter or bypass the respawn timer.
          owner.vx = owner.vy = 0;
          this.patrol.reset(owner.id);
          this.announce(owner.name, 'switched teams', team);
        }
        return { accepted: true };
      }
      if (this.state.fighters.length >= MAX_FIGHTERS)
        return { accepted: false, reason: 'The arena is full' };
      const fighter = this.create(event.viewer, team);
      this.state.fighters.push(fighter);
      this.effect({ type: 'join', team, x: fighter.x, y: fighter.y });
      this.announce(fighter.name, 'joined', team);
      return { accepted: true };
    }
    if (event.type === 'chat') return { accepted: false, reason: 'Type red or blue to join' };
    const eventTeam =
      event.type === 'gift'
        ? (event.team ?? owner?.team ?? supporterTeam)
        : (owner?.team ?? supporterTeam);
    if (event.type === 'gift' && event.gift === 'thanks') {
      this.acknowledge(event.viewer, `thank you ×${event.amount}`, eventTeam);
      return { accepted: true, status: 'cosmetic', details: { requested: event.amount } };
    }
    if (!eventTeam) return { accepted: false, reason: 'Join red or blue first' };
    if (event.type === 'like') {
      this.state.likes[eventTeam] += event.count;
      if (this.state.likes[eventTeam] >= 20) {
        const charges = Math.floor(this.state.likes[eventTeam] / 20);
        this.state.likes[eventTeam] %= 20;
        this.state.boosts[eventTeam] = Math.max(
          this.state.boosts[eventTeam],
          Math.min(16, this.state.boosts[eventTeam] + 4 * charges),
        );
        this.effect({ type: 'boost', team: eventTeam, x: eventTeam === 'red' ? 90 : 390, y: 400 });
        this.announce(event.viewer.name, 'charged team power', eventTeam);
      }
    }
    if (event.type === 'follow') {
      for (const f of this.state.fighters)
        if (f.team === eventTeam && f.hp > 0) f.hp = Math.min(f.maxHp, f.hp + 25);
      this.announce(event.viewer.name, 'healed the team', eventTeam);
    }
    if (event.type === 'gift') {
      const details: NonNullable<EventResult['details']> = { requested: event.amount };
      let reason: string | undefined;
      if (event.gift === 'reinforce') {
        const count = Math.min(3 * event.amount, MAX_FIGHTERS - this.state.fighters.length);
        details.spawned = count;
        if (count < 3 * event.amount)
          reason = 'Ally capacity reached; overflow acknowledged cosmetically';
        for (let i = 0; i < count; i++) {
          const ally = this.create(event.viewer, eventTeam, true);
          this.state.fighters.push(ally);
          this.effect({ type: 'join', team: eventTeam, x: ally.x, y: ally.y });
        }
      }
      if (event.gift === 'shield') {
        const before = this.state.shields[eventTeam];
        this.state.shields[eventTeam] = Math.min(
          18,
          this.state.shields[eventTeam] + 6 * event.amount,
        );
        details.secondsAdded = this.state.shields[eventTeam] - before;
        if (details.secondsAdded < 6 * event.amount)
          reason = 'Shield duration capped at 18 seconds; overflow acknowledged';
        this.effect({ type: 'shield', team: eventTeam, x: 240, y: 400 });
      }
      if (event.gift === 'boost') {
        const before = this.state.boosts[eventTeam];
        this.state.boosts[eventTeam] = Math.min(
          24,
          this.state.boosts[eventTeam] + 8 * event.amount,
        );
        details.secondsAdded = this.state.boosts[eventTeam] - before;
        if (details.secondsAdded < 8 * event.amount)
          reason = 'Power duration capped at 24 seconds; overflow acknowledged';
        this.effect({ type: 'boost', team: eventTeam, x: 240, y: 400 });
      }
      if (event.gift === 'meteor') {
        const center = this.state.territory * WORLD.width;
        this.effect({ type: 'meteor', team: eventTeam, x: center, y: 390 });
        const enemies = this.state.fighters
          .filter((f) => f.team !== eventTeam && f.hp > 0)
          .sort((a, b) => Math.abs(a.x - center) - Math.abs(b.x - center))
          .slice(0, 10);
        details.targets = enemies.length;
        if (!enemies.length) reason = 'No living opponents; gift acknowledged cosmetically';
        for (const enemy of enemies)
          this.damage(enemy, 55 * event.amount, owner?.team === eventTeam ? owner : undefined);
        this.patrol.constrain(this.state.fighters, this.state.territory, this.state.round);
      }
      this.announce(event.viewer.name, `sent ${event.gift}`, eventTeam);
      const cosmetic = details.spawned === 0 || details.secondsAdded === 0 || details.targets === 0;
      return { accepted: true, status: cosmetic ? 'cosmetic' : 'applied', details, reason };
    }
    return { accepted: true };
  }
  private damage(target: Fighter, amount: number, attacker?: Fighter) {
    if (target.hp <= 0) return;
    target.hp = Math.max(0, target.hp - amount * (this.state.shields[target.team] > 0 ? 0.25 : 1));
    this.effect({ type: 'hit', team: target.team, x: target.x, y: target.y, fighterId: target.id });
    if (target.hp > 0) return;
    target.respawn = 3;
    target.vx = target.vy = 0;
    const winningTeam = opposite(target.team);
    this.state.scores[winningTeam]++;
    this.state.territory = clamp(
      this.state.territory + (winningTeam === 'red' ? 0.012 : -0.012),
      0.08,
      0.92,
    );
    if (attacker) {
      attacker.kills++;
      attacker.level = Math.min(4, 1 + Math.floor(attacker.kills / 3));
      attacker.maxHp = 100 + (attacker.level - 1) * 20;
    }
    this.effect({ type: 'defeat', team: target.team, x: target.x, y: target.y });
  }
  restart() {
    const s = this.state;
    s.round++;
    s.phase = 'battle';
    s.winner = null;
    s.remaining = ROUND_SECONDS;
    s.territory = 0.5;
    s.scores = { red: 0, blue: 0 };
    s.shields = { red: 0, blue: 0 };
    s.boosts = { red: 0, blue: 0 };
    s.likes = { red: 0, blue: 0 };
    s.fighters = s.fighters.filter((f) => !f.temporary);
    s.effects = [];
    this.patrol.reset();
    for (const f of s.fighters) {
      Object.assign(f, this.position(f.team));
      f.hp = f.maxHp = 100;
      f.level = 1;
      f.kills = 0;
      f.respawn = 0;
      f.vx = f.vy = 0;
    }
    this.announce('Arena', `Round ${s.round} started`);
  }
  update(dt: number) {
    const s = this.state;
    if (s.paused || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    s.remaining = Math.max(0, s.remaining - dt);
    if (s.phase === 'result') {
      if (!s.remaining) this.restart();
      return;
    }
    for (const team of ['red', 'blue'] as const) {
      s.shields[team] = Math.max(0, s.shields[team] - dt);
      s.boosts[team] = Math.max(0, s.boosts[team] - dt);
    }
    const respawned = new Set<string>();
    for (const f of [...s.fighters]) {
      if (f.hp <= 0) {
        f.respawn -= dt;
        if (f.respawn <= 0) {
          if (f.temporary) s.fighters = s.fighters.filter((ally) => ally.id !== f.id);
          else {
            Object.assign(f, this.position(f.team));
            f.hp = f.maxHp;
            f.vx = f.vy = 0;
            this.patrol.reset(f.id);
            respawned.add(f.id);
            this.effect({ type: 'join', team: f.team, x: f.x, y: f.y });
          }
        }
      }
    }
    this.patrol.update(s.fighters, dt, s.territory, s.round);
    const attacks: { target: Fighter; amount: number; attacker: Fighter }[] = [];
    for (const f of s.fighters) {
      if (f.hp <= 0 || respawned.has(f.id)) continue;
      let target: Fighter | undefined,
        distance = Infinity;
      for (const other of s.fighters) {
        if (other.team === f.team || other.hp <= 0) continue;
        const d = Math.hypot(other.x - f.x, other.y - f.y);
        if (d < distance) {
          target = other;
          distance = d;
        }
      }
      f.cooldown = Math.max(0, f.cooldown - dt);
      if (target && distance < 180) {
        if (f.cooldown === 0) {
          f.cooldown = 0.65;
          this.effect({
            type: 'shot',
            team: f.team,
            x: f.x,
            y: f.y,
            targetX: target.x,
            targetY: target.y,
            fighterId: f.id,
          });
          attacks.push({
            target,
            amount: (10 + f.level * 2) * (s.boosts[f.team] > 0 ? 2 : 1),
            attacker: f,
          });
        }
      }
    }
    // Resolve after everyone chooses an attack, so roster order gives neither team a first strike.
    for (const attack of attacks) this.damage(attack.target, attack.amount, attack.attacker);
    this.patrol.constrain(s.fighters, s.territory, s.round);
    const won = s.territory >= 0.9 ? 'red' : s.territory <= 0.1 ? 'blue' : null;
    if (won || s.remaining === 0) {
      s.winner =
        won ?? (Math.abs(s.territory - 0.5) < 0.001 ? 'draw' : s.territory > 0.5 ? 'red' : 'blue');
      s.phase = 'result';
      s.remaining = 8;
      this.announce(
        'Arena',
        s.winner === 'draw' ? 'Round drawn' : `${s.winner.toUpperCase()} wins`,
      );
    }
  }
}
