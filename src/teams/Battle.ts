import {
  hasTeamPower,
  LIKE_UPGRADES,
  MAX_FIGHTERS,
  ROUND_SECONDS,
  selectedTeam,
  TEAM_RALLY_LIKES,
  WORLD,
} from './contracts';
import type {
  AudienceEvent,
  BattleActivity,
  BattleEffect,
  BattleState,
  Fighter,
  Team,
  TeamGift,
  Viewer,
} from './contracts';
import { Patrol } from './Patrol';
import { FIELD, territoryRange } from './territory';

export interface EventResult {
  accepted: boolean;
  reason?: string;
  status?: 'queued' | 'applied' | 'cosmetic';
  details?: { requested: number; spawned?: number; secondsAdded?: number; targets?: number };
}
const opposite = (team: Team): Team => (team === 'red' ? 'blue' : 'red');
const SMALL_BATTLE_SIZE = 6;
const SMALL_BATTLE_RANGE = 215;
const timedGifts: Partial<
  Record<
    TeamGift,
    {
      field: 'shields' | 'boosts' | 'haste' | 'frost';
      label: string;
      duration: number;
      limit: number;
      effect: BattleEffect['type'];
    }
  >
> = {
  shield: { field: 'shields', label: 'Shield', duration: 6, limit: 18, effect: 'shield' },
  boost: { field: 'boosts', label: 'Power', duration: 8, limit: 24, effect: 'boost' },
  haste: { field: 'haste', label: 'Haste', duration: 6, limit: 12, effect: 'rally' },
  frost: { field: 'frost', label: 'Frost', duration: 5, limit: 10, effect: 'frost' },
};
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));
const likeTier = (likes: number) =>
  LIKE_UPGRADES.filter((upgrade) => likes >= upgrade.likes).length - 1;
const mention = (viewer: Viewer) => (viewer.handle ? `@${viewer.handle}` : viewer.name);
const freshState = (sequence = 0): BattleState => ({
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
  fighters: [],
  effects: [],
  activity: [],
  sequence,
});

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
    this.state = restored ?? freshState();
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
  private announce(
    name: string,
    text: string,
    team?: Team,
    meta?: Pick<BattleActivity, 'kind' | 'gift'>,
  ) {
    this.state.activity.unshift({ id: ++this.state.sequence, name, text, team, ...meta });
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
    const tier = temporary ? 0 : likeTier(this.state.viewerLikes?.[`viewer:${viewer.id}`] ?? 0);
    const upgrade = LIKE_UPGRADES[tier];
    return {
      id: `fighter-${++this.nextFighter}`,
      ownerId: viewer.id,
      name: viewer.name,
      avatar: viewer.avatar,
      team,
      ...this.position(team),
      hp: 100 + upgrade.hp,
      maxHp: 100 + upgrade.hp,
      level: 1,
      ...(tier ? { likeTier: tier, likePower: upgrade.damage } : {}),
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
  private thankGift(event: Extract<AudienceEvent, { type: 'gift' }>, owner?: Fighter, team?: Team) {
    const count = event.amount > 1 ? ` ×${event.amount}` : '';
    const text = event.giftName
      ? `sent ${event.giftName}`
      : event.gift === 'thanks'
        ? 'thank you'
        : `sent ${event.gift}`;
    this.announce(event.viewer.name, text + count, team, { kind: 'gift', gift: event.gift });
    const position = owner && owner.hp > 0 ? owner : { x: WORLD.width / 2, y: 400 };
    this.effect({ type: 'gift', team, x: position.x, y: position.y });
  }
  private healTeam(team: Team, hp: number) {
    let healed = 0;
    for (const fighter of this.state.fighters) {
      if (fighter.team === team && fighter.hp > 0 && fighter.hp < fighter.maxHp) {
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + hp);
        healed++;
      }
    }
    return healed;
  }
  private respawn(fighter: Fighter) {
    Object.assign(fighter, this.position(fighter.team));
    fighter.hp = fighter.maxHp;
    fighter.respawn = fighter.vx = fighter.vy = 0;
    this.patrol.reset(fighter.id);
    this.effect({ type: 'join', team: fighter.team, x: fighter.x, y: fighter.y });
  }
  replaceRoster(viewers: { viewer: Viewer; team: Team }[]) {
    this.state.fighters = viewers.map(({ viewer, team }) => this.create(viewer, team));
    this.patrol.reset();
  }
  resetSession(roomId?: string) {
    this.state = freshState(this.state.sequence);
    this.state.liveRoomId = roomId;
    this.patrol.reset();
  }
  apply(event: AudienceEvent, supporterTeam?: Team): EventResult {
    const owner = this.state.fighters.find((f) => f.ownerId === event.viewer.id && !f.temporary);
    const registeredTeam = owner?.team ?? supporterTeam;
    if (event.type === 'viewerJoined') {
      if (!registeredTeam)
        this.announce(mention(event.viewer), 'Type RED or BLUE to join', undefined, {
          kind: 'welcome',
        });
      return { accepted: true };
    }
    if (event.type === 'chat' && event.message.trim().toLowerCase() === '!power') {
      const total = this.state.viewerLikes?.[`viewer:${event.viewer.id}`] ?? 0;
      const tier = likeTier(total);
      const next = LIKE_UPGRADES[tier + 1];
      const likesNeeded = next ? next.likes - total : 0;
      const reason = !registeredTeam
        ? 'Type RED or BLUE to join'
        : next
          ? `Power ${tier}/${LIKE_UPGRADES.length - 1} · ${likesNeeded} ${likesNeeded === 1 ? 'like' : 'likes'} to ${next.label}`
          : 'Max power · likes still heal your team';
      this.announce(mention(event.viewer), reason, registeredTeam, { kind: 'power' });
      return { accepted: true, status: 'cosmetic', reason };
    }
    if (this.state.phase !== 'battle')
      return { accepted: false, reason: 'The next round starts shortly' };
    const team = selectedTeam(event);
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
    const eventTeam = event.type === 'gift' ? (event.team ?? registeredTeam) : registeredTeam;
    if (event.type === 'gift' && event.gift === 'thanks') {
      this.thankGift(event, owner, eventTeam);
      return { accepted: true, status: 'cosmetic', details: { requested: event.amount } };
    }
    if (!eventTeam) return { accepted: false, reason: 'Join red or blue first' };
    if (event.type === 'like') {
      const totals = (this.state.viewerLikes ??= {});
      const key = `viewer:${event.viewer.id}`;
      const previous = totals[key] ?? 0;
      const total = Math.min(LIKE_UPGRADES[LIKE_UPGRADES.length - 1].likes, previous + event.count);
      totals[key] = total;
      const tier = likeTier(total);
      const before = likeTier(previous);
      const upgrade = LIKE_UPGRADES[tier];
      if (tier > before) {
        if (owner) {
          const extraHp = upgrade.hp - LIKE_UPGRADES[before].hp;
          owner.likeTier = tier;
          owner.likePower = upgrade.damage;
          owner.maxHp += extraHp;
          if (owner.hp > 0) owner.hp += extraHp;
          this.effect({ type: 'boost', team: eventTeam, x: owner.x, y: owner.y });
        }
        this.announce(event.viewer.name, `unlocked ${upgrade.label}`, eventTeam, { kind: 'power' });
      }
      const meters = (this.state.rallyLikes ??= { red: 0, blue: 0 });
      const teamLikes = meters[eventTeam] + event.count;
      const rallies = Math.floor(teamLikes / TEAM_RALLY_LIKES);
      meters[eventTeam] = teamLikes % TEAM_RALLY_LIKES;
      if (rallies) {
        this.healTeam(eventTeam, 10 * rallies);
        this.effect({ type: 'rally', team: eventTeam, x: eventTeam === 'red' ? 120 : 360, y: 400 });
        this.announce(eventTeam.toUpperCase(), 'rallied · team heal', eventTeam);
      }
    }
    if (event.type === 'follow') {
      this.healTeam(eventTeam, 25);
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
      const timed = timedGifts[event.gift];
      if (timed) {
        const team = event.gift === 'frost' ? opposite(eventTeam) : eventTeam;
        const timers = (this.state[timed.field] ??= { red: 0, blue: 0 });
        const before = timers[team];
        const seconds = timed.duration * event.amount;
        timers[team] = Math.min(timed.limit, before + seconds);
        details.secondsAdded = timers[team] - before;
        if (details.secondsAdded < seconds)
          reason = `${timed.label} duration capped at ${timed.limit} seconds; overflow acknowledged`;
        const x = event.gift === 'frost' ? (team === 'red' ? 120 : 360) : WORLD.width / 2;
        this.effect({ type: timed.effect, team, x, y: 400 });
      }
      if (event.gift === 'heal') {
        details.targets = this.healTeam(eventTeam, 20 * event.amount);
        if (!details.targets) reason = 'No injured allies; gift acknowledged cosmetically';
        this.effect({ type: 'rally', team: eventTeam, x: eventTeam === 'red' ? 120 : 360, y: 400 });
      }
      if (event.gift === 'revive') {
        const allies = this.state.fighters
          .filter((f) => f.team === eventTeam && f.hp <= 0 && !f.temporary)
          .slice(0, event.amount);
        details.targets = allies.length;
        if (!allies.length) reason = 'No downed allies; gift acknowledged cosmetically';
        for (const ally of allies) this.respawn(ally);
      }
      if (event.gift === 'meteor' || event.gift === 'bolt') {
        const meteor = event.gift === 'meteor';
        const center = this.state.territory * WORLD.width;
        if (meteor) this.effect({ type: 'meteor', team: eventTeam, x: center, y: 390 });
        const enemies = this.state.fighters
          .filter((f) => f.team !== eventTeam && f.hp > 0)
          .sort((a, b) => Math.abs(a.x - center) - Math.abs(b.x - center))
          .slice(0, meteor ? 10 : 1);
        details.targets = enemies.length;
        if (!enemies.length) reason = 'No living opponents; gift acknowledged cosmetically';
        for (const enemy of enemies) {
          if (!meteor) this.effect({ type: 'bolt', team: eventTeam, x: enemy.x, y: enemy.y });
          this.damage(
            enemy,
            (meteor ? 55 : 35) * event.amount,
            owner?.team === eventTeam ? owner : undefined,
          );
        }
        this.patrol.constrain(this.state.fighters, this.state.territory, this.state.round);
      }
      this.thankGift(event, owner, eventTeam);
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
      attacker.maxHp =
        100 + (attacker.level - 1) * 20 + (LIKE_UPGRADES[attacker.likeTier ?? 0]?.hp ?? 0);
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
    s.haste = undefined;
    s.frost = undefined;
    s.viewerLikes = undefined;
    s.rallyLikes = undefined;
    s.fighters = s.fighters.filter((f) => !f.temporary);
    s.effects = [];
    this.patrol.reset();
    for (const f of s.fighters) {
      Object.assign(f, this.position(f.team));
      f.hp = f.maxHp = 100;
      f.level = 1;
      delete f.likePower;
      delete f.likeTier;
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
      if (s.haste) s.haste[team] = Math.max(0, s.haste[team] - dt);
      if (s.frost) s.frost[team] = Math.max(0, s.frost[team] - dt);
    }
    const respawned = new Set<string>();
    for (const f of [...s.fighters]) {
      if (f.hp <= 0) {
        f.respawn -= dt;
        if (f.respawn <= 0) {
          if (f.temporary) s.fighters = s.fighters.filter((ally) => ally.id !== f.id);
          else {
            this.respawn(f);
            respawned.add(f.id);
          }
        }
      }
    }
    const smallBattle =
      s.fighters.length <= SMALL_BATTLE_SIZE &&
      s.fighters.some((fighter) => fighter.team === 'red') &&
      s.fighters.some((fighter) => fighter.team === 'blue');
    const attackRange = smallBattle ? SMALL_BATTLE_RANGE : 180;
    this.patrol.update(s.fighters, dt, s.territory, s.round, smallBattle ? attackRange : undefined);
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
      const haste = (s.haste?.[f.team] ?? 0) > 0 ? 1.3 : 1;
      const frost = (s.frost?.[f.team] ?? 0) > 0 ? 0.65 : 1;
      f.cooldown = Math.max(0, f.cooldown - dt * haste * frost);
      if (target && distance < attackRange && f.cooldown === 0) {
        f.cooldown = (smallBattle ? 0.52 : 0.65) * (LIKE_UPGRADES[f.likeTier ?? 0]?.cooldown ?? 1);
        const giftPower = hasTeamPower(s, f.team);
        const bonus = f.likePower ?? 0;
        const powered = giftPower || bonus > 0;
        this.effect({
          type: 'shot',
          team: f.team,
          x: f.x,
          y: f.y,
          targetX: target.x,
          targetY: target.y,
          fighterId: f.id,
          ...(powered ? { powered } : {}),
        });
        attacks.push({
          target,
          amount: (10 + f.level * 2) * (giftPower ? 2 : 1) + bonus,
          attacker: f,
        });
      }
    }
    // Resolve after everyone chooses an attack, so roster order gives neither team a first strike.
    for (const attack of attacks) this.damage(attack.target, attack.amount, attack.attacker);
    this.patrol.constrain(s.fighters, s.territory, s.round);
    if (s.remaining === 0) {
      s.winner = Math.abs(s.territory - 0.5) < 0.001 ? 'draw' : s.territory > 0.5 ? 'red' : 'blue';
      s.phase = 'result';
      s.remaining = 8;
      this.announce(
        'Arena',
        s.winner === 'draw' ? 'Round drawn' : `${s.winner.toUpperCase()} wins`,
      );
    }
  }
}
