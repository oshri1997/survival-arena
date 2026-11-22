import { z } from 'zod';

export const teamSchema = z.enum(['red', 'blue']);
export type Team = z.infer<typeof teamSchema>;
export const giftSchema = z.enum([
  'reinforce',
  'shield',
  'meteor',
  'boost',
  'thanks',
  'frost',
  'heal',
  'bolt',
  'revive',
  'haste',
]);
export type TeamGift = z.infer<typeof giftSchema>;
const httpsImage = z
  .string()
  .max(1200)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Avatar must be an HTTPS URL');
export const viewerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(32),
  handle: z
    .string()
    .max(32)
    .regex(/^[A-Za-z0-9_.]+$/)
    .optional(),
  avatar: httpsImage.optional(),
});
export type Viewer = z.infer<typeof viewerSchema>;
const envelope = z.object({ id: z.string().min(1).max(160), viewer: viewerSchema }).strict();
export const audienceEventSchema = z.discriminatedUnion('type', [
  envelope.extend({ type: z.literal('viewerJoined') }),
  envelope.extend({ type: z.literal('chat'), message: z.string().trim().min(1).max(200) }),
  envelope.extend({ type: z.literal('like'), count: z.number().int().min(1).max(1_000_000) }),
  envelope.extend({
    type: z.literal('gift'),
    gift: giftSchema,
    giftName: z.string().trim().min(1).max(100).optional(),
    amount: z.number().int().min(1).max(1_000_000).default(1),
    team: teamSchema.optional(),
  }),
  envelope.extend({ type: z.literal('follow') }),
  envelope.extend({ type: z.literal('join'), team: teamSchema }),
]);
export type AudienceEvent = z.infer<typeof audienceEventSchema>;
export function selectedTeam(event: AudienceEvent): Team | undefined {
  if (event.type === 'join') return event.team;
  if (event.type !== 'chat') return;
  switch (event.message.trim().toLowerCase()) {
    case 'red':
    case '1':
    case 'אדום':
      return 'red';
    case 'blue':
    case '2':
    case 'כחול':
      return 'blue';
  }
}
export const adminActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pause'), paused: z.boolean() }),
  z.object({ type: z.literal('restart') }),
  z.object({ type: z.literal('autoplay'), enabled: z.boolean() }),
  z.object({ type: z.literal('crowd'), count: z.number().int().min(2).max(20) }),
  z.object({ type: z.literal('event'), event: audienceEventSchema }),
]);
export type AdminAction = z.infer<typeof adminActionSchema>;

export interface Fighter {
  id: string;
  ownerId: string;
  name: string;
  avatar?: string;
  team: Team;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  hp: number;
  maxHp: number;
  level: number;
  likePower?: number;
  likeTier?: number;
  kills: number;
  cooldown: number;
  respawn: number;
  temporary: boolean;
}
export interface BattleEffect {
  id: number;
  type:
    | 'shot'
    | 'hit'
    | 'defeat'
    | 'shield'
    | 'meteor'
    | 'boost'
    | 'join'
    | 'rally'
    | 'gift'
    | 'frost'
    | 'bolt';
  team?: Team;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  fighterId?: string;
  powered?: boolean;
}
export interface BattleActivity {
  id: number;
  name: string;
  text: string;
  team?: Team;
  kind?: 'gift' | 'welcome' | 'power';
  gift?: TeamGift;
  giftDetail?: string;
}
export interface BattleState {
  round: number;
  remaining: number;
  phase: 'battle' | 'result';
  winner: Team | 'draw' | null;
  paused: boolean;
  autoplay: boolean;
  territory: number;
  scores: Record<Team, number>;
  shields: Record<Team, number>;
  boosts: Record<Team, number>;
  haste?: Record<Team, number>;
  frost?: Record<Team, number>;
  viewerLikes?: Record<string, number>;
  rallyLikes?: Record<Team, number>;
  liveRoomId?: string;
  fighters: Fighter[];
  effects: BattleEffect[];
  activity: BattleActivity[];
  sequence: number;
}
export interface BattleSnapshot extends Omit<BattleState, 'viewerLikes' | 'liveRoomId'> {
  connected: true;
  demoJoin: boolean;
  live?: 'waiting' | 'live';
  giftOverrides?: Record<string, TeamGift>;
}
export const WORLD = { width: 480, height: 800 };
export const MAX_FIGHTERS = 100;
// Leave room for gift allies. Registered viewers rotate fairly between rounds.
export const MAX_ACTIVE_VIEWERS = 80;
export const ROUND_SECONDS = 240;
export const hasTeamPower = (state: Pick<BattleState, 'boosts'>, team: Team) =>
  state.boosts[team] > 0;
// Cumulative personal stats at each likes milestone. The first entry is the baseline.
export const LIKE_UPGRADES = [
  { likes: 0, damage: 0, hp: 0, cooldown: 1, label: 'base stats' },
  { likes: 50, damage: 2, hp: 0, cooldown: 1, label: '+2 damage' },
  { likes: 150, damage: 4, hp: 0, cooldown: 1, label: '+4 damage' },
  { likes: 350, damage: 6, hp: 0, cooldown: 1, label: '+6 damage' },
  { likes: 600, damage: 6, hp: 10, cooldown: 1, label: '+10 max HP' },
  { likes: 900, damage: 6, hp: 10, cooldown: 0.93, label: '7% shorter attack cooldown' },
  { likes: 1250, damage: 7, hp: 10, cooldown: 0.93, label: '+7 damage' },
  { likes: 1700, damage: 7, hp: 20, cooldown: 0.93, label: '+20 max HP' },
  { likes: 2300, damage: 7, hp: 20, cooldown: 0.86, label: '14% shorter attack cooldown' },
] as const;
export const TEAM_RALLY_LIKES = 200;
export const GIFT_RULES = {
  reinforce: { allies: 3 },
  shield: { seconds: 6, cap: 18, damageReduction: 0.75 },
  meteor: { damage: 55, targets: 10 },
  boost: { seconds: 8, cap: 24, damageMultiplier: 2 },
  frost: { seconds: 5, cap: 10, fireRate: 0.65 },
  heal: { hp: 20 },
  bolt: { damage: 35, targets: 1 },
  revive: { allies: 1 },
  haste: { seconds: 6, cap: 12, fireRate: 1.3 },
} as const;
export const GIFTS: Record<
  TeamGift,
  { name: string; description: string; short: string; image: string }
> = {
  thanks: {
    name: 'Thank you',
    description: 'Golden sparks and a shout-out',
    short: 'Golden shout-out',
    image: '/assets/spark.png',
  },
  reinforce: {
    name: 'Reinforcements',
    description: `Deploy ${GIFT_RULES.reinforce.allies} temporary allies`,
    short: `Deploy ${GIFT_RULES.reinforce.allies} allies`,
    image: '/assets/guardian.png',
  },
  shield: {
    name: 'Shield',
    description: `Reduce incoming damage by ${GIFT_RULES.shield.damageReduction * 100}% for ${GIFT_RULES.shield.seconds} seconds`,
    short: `${GIFT_RULES.shield.damageReduction * 100}% shield · ${GIFT_RULES.shield.seconds}s`,
    image: '/assets/crystal.png',
  },
  meteor: {
    name: 'Meteor',
    description: `${GIFT_RULES.meteor.damage} base damage each to up to ${GIFT_RULES.meteor.targets} enemies`,
    short: `${GIFT_RULES.meteor.damage} DMG · up to ${GIFT_RULES.meteor.targets} foes`,
    image: '/assets/fireball.png',
  },
  boost: {
    name: 'Power',
    description: `${GIFT_RULES.boost.damageMultiplier}× base attack damage for ${GIFT_RULES.boost.seconds} seconds`,
    short: `${GIFT_RULES.boost.damageMultiplier}× base damage · ${GIFT_RULES.boost.seconds}s`,
    image: '/assets/bolt.png',
  },
  frost: {
    name: 'Frost',
    description: `Slow enemy fire for ${GIFT_RULES.frost.seconds} seconds`,
    short: `Slow enemy fire · ${GIFT_RULES.frost.seconds}s`,
    image: '/assets/wraith.png',
  },
  heal: {
    name: 'Heal',
    description: `Restore up to ${GIFT_RULES.heal.hp} HP to each living teammate`,
    short: `Team heal · ${GIFT_RULES.heal.hp} HP`,
    image: '/assets/torch.png',
  },
  bolt: {
    name: 'Lightning',
    description: `${GIFT_RULES.bolt.damage} base damage to one enemy`,
    short: `Lightning · ${GIFT_RULES.bolt.damage} DMG`,
    image: '/assets/impact.png',
  },
  revive: {
    name: 'Revive',
    description: `Revive ${GIFT_RULES.revive.allies} downed main fighter at full health`,
    short: `Revive ${GIFT_RULES.revive.allies} teammate`,
    image: '/assets/skeleton.png',
  },
  haste: {
    name: 'Haste',
    description: `Team fires faster for ${GIFT_RULES.haste.seconds} seconds`,
    short: `Faster fire · ${GIFT_RULES.haste.seconds}s`,
    image: '/assets/imp.png',
  },
};
