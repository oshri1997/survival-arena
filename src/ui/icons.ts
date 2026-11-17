const paths: Record<string, string> = {
  crystal: '<path d="m12 2 7 9-7 11-7-11 7-9Z"/><path d="m12 2-2 9 2 11 3-11-3-9ZM5 11h14"/>',
  sword: '<path d="m5 20 4-4m-3-3 5 5M9 14 18 3h3v3L11 17M3 21l3-1-2-2-1 3Z"/>',
  fire: '<path d="M13 2c2 7-5 7-3 12 2-1 3-3 3-5 4 3 6 5 6 8a7 7 0 0 1-14 0c0-5 6-7 8-15Z"/>',
  ice: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4m15 9-4 1 1 4M3 14l4 1-1 4m15-9-4-1 1-4"/>',
  bolt: '<path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z"/>',
  rose: '<path d="M12 22v-9m0 6q-7 0-7-5 6 0 7 5m0-2q6 0 6-4-5 0-6 4M6 6c-1-5 5-5 6-2 4-5 9 1 5 4 2 5-6 8-8 4-5 0-6-4-3-6Z"/><path d="M8 5q4-1 6 3-2 4-5 1"/>',
  meteor:
    '<path d="m20 2-8 9m10-4-7 8M16 2l-5 5M7 9a7 7 0 1 0 8 8"/><path d="m8 12 4 4-3 3-4-2-1-3 4-2Z"/>',
  crown: '<path d="m3 6 5 5 4-8 4 8 5-5-2 13H5L3 6Zm2 10h14"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 2 11 8 16 6-5 13-11 8-16Z"/>',
  users:
    '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3m2-17a3 3 0 0 1 0 6m1 4a6 6 0 0 1 3 7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  external: '<path d="M14 3h7v7m0-7-12 12M10 3H3v18h18v-7"/>',
  sound: '<path d="M11 4 6 8H2v8h4l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 4 6 8H2v8h4l5 4V4Zm5 5 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 13 8-13 8V4Z"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
  shield: '<path d="m12 2 9 4v7c0 5-9 9-9 9s-9-4-9-9V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  chevron: '<path d="m8 4 8 8-8 8"/>',
  chat: '<path d="M21 3H3v14h5l4 4 4-4h5V3ZM7 8h10M7 12h6"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
  leaf: '<path d="M20 3C4 0 0 19 10 20c8 1 11-10 10-17ZM4 22 16 7"/>',
};
export const icon = (name: string, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.crystal}</svg>`;
