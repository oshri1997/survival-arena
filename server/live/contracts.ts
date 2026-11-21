import { z } from 'zod';
import { giftSchema, viewerSchema } from '../../src/teams/contracts';

// IDs must remain strings: TikTok's 64-bit IDs exceed JS integer precision.
const id = z.string().min(1).max(160);
const base = z.object({ id, roomId: id, viewer: viewerSchema }).strict();
export const liveEventSchema = z.discriminatedUnion('type', [
  base.extend({ type: z.literal('viewerJoined') }),
  base.extend({ type: z.literal('chat'), message: z.string().trim().min(1).max(200) }),
  base.extend({ type: z.literal('like'), count: z.number().int().min(1).max(1_000_000) }),
  base.extend({ type: z.literal('follow') }),
  base.extend({
    type: z.literal('gift'),
    recipientId: id,
    giftId: id,
    giftName: z.string().trim().min(1).max(100),
    count: z.number().int().min(1).max(1_000_000),
    streak: z.boolean(),
    streakEnd: z.boolean(),
    seriesId: id.optional(),
  }),
]);
export type LiveEvent = z.infer<typeof liveEventSchema>;
export interface LiveBinding {
  roomId: string;
  creatorId: string;
}
export const mappingSchema = z.object({ giftId: id, action: giftSchema }).strict();
