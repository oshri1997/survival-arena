import { z } from 'zod';

export const teamSchema = z.enum(['red', 'blue']);
export type Team = z.infer<typeof teamSchema>;
export const giftSchema = z.enum(['reinforce', 'shield', 'meteor', 'boost']);
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
  avatar: httpsImage.optional(),
});
export type Viewer = z.infer<typeof viewerSchema>;
const envelope = z.object({ id: z.string().min(1).max(160), viewer: viewerSchema });
export const audienceEventSchema = z.discriminatedUnion('type', [
  envelope.extend({ type: z.literal('viewerJoined') }),
  envelope.extend({ type: z.literal('chat'), message: z.string().trim().min(1).max(200) }),
  envelope.extend({ type: z.literal('like'), count: z.number().int().min(1).max(100) }),
  envelope.extend({
    type: z.literal('gift'),
    gift: giftSchema,
    amount: z.number().int().min(1).max(20).default(1),
    team: teamSchema.optional(),
  }),
  envelope.extend({ type: z.literal('follow') }),
  envelope.extend({ type: z.literal('join'), team: teamSchema }),
]);
export type AudienceEvent = z.infer<typeof audienceEventSchema>;
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
  kills: number;
  cooldown: number;
  respawn: number;
  temporary: boolean;
}
export interface BattleEffect {
  id: number;
  type: 'shot' | 'hit' | 'defeat' | 'shield' | 'meteor' | 'boost' | 'join';
  team: Team;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  fighterId?: string;
}
export interface BattleActivity {
  id: number;
  name: string;
  text: string;
  team?: Team;
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
  likes: Record<Team, number>;
  fighters: Fighter[];
  effects: BattleEffect[];
  activity: BattleActivity[];
  sequence: number;
}
export interface BattleSnapshot extends BattleState {
  connected: true;
  demoJoin: boolean;
}
export const WORLD = { width: 480, height: 800 };
export const MAX_FIGHTERS = 100;
export const ROUND_SECONDS = 120;
export const GIFTS: Record<TeamGift, { name: string; description: string }> = {
  reinforce: { name: 'Reinforcements', description: 'Deploy 3 allies' },
  shield: { name: 'Shield', description: 'Protect the team for 6 seconds' },
  meteor: { name: 'Meteor', description: 'Strike enemies near the front' },
  boost: { name: 'Power', description: 'Double attack power for 8 seconds' },
};
