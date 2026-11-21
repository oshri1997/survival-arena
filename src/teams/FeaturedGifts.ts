import type { TeamGift } from './contracts';

// TikTok gift IDs from the Euler Stream catalog. IDs, not localized names, select effects.
export const FEATURED_GIFTS = [
  { id: '5655', name: 'Rose', action: 'thanks', symbol: '🌹' },
  { id: '5827', name: 'Ice Cream Cone', action: 'frost', symbol: '🍦' },
  { id: '6247', name: 'Heart', action: 'heal', symbol: '❤️' },
  { id: '6652', name: 'Lightning Bolt', action: 'bolt', symbol: '⚡' },
  { id: '5487', name: 'Finger Heart', action: 'revive', symbol: '🫰' },
  { id: '5658', name: 'Perfume', action: 'haste', symbol: '💐' },
  { id: '5879', name: 'Doughnut', action: 'reinforce', symbol: '🍩' },
  { id: '5659', name: 'Paper Crane', action: 'shield', symbol: '🕊️' },
  { id: '6104', name: 'Cap', action: 'boost', symbol: '🧢' },
  { id: '11046', name: 'Galaxy', action: 'meteor', symbol: '🌌' },
] as const satisfies readonly { id: string; name: string; action: TeamGift; symbol: string }[];
