# Survival Arena LIVE

Defend the last light: a playable, portrait fantasy crystal-defense game built with **Phaser 3.90, strict TypeScript, Arcade Physics and Vite**. The guardian attacks automatically; you command fire, frost and lightning, choose blessings between waves, and face the Hollow King every fifth wave.

All LIVE activity is **local simulation**. No TikTok SDK, account connection, credentials, payments or network event provider is present.

## Run

Requires Node 22+.

```sh
npm ci
npm run dev
```

Open the printed URL. For an iPhone on the same network, use the host machine’s LAN address. Static files require a web server; opening `index.html` as a file is no longer supported.

```sh
npm run build           # strict type check + production bundle in dist/
npm run preview         # serve the production build
npm test                # headless rules + mock-provider tests
npx playwright install --with-deps chromium webkit
npm run test:e2e         # production browser checks, desktop + iPhone WebKit
npm run format:check
```

## Play

- Tap **Enter the arena**. The guardian fires emerald bolts at the nearest enemy automatically.
- **Fire Nova / Q:** area damage near the crystal; 12s cooldown.
- **Frost Ward / W:** freeze enemies for 5s and cancel active boss ground attacks/projectiles; 18s cooldown.
- **Arc Lightning / E:** strike the five nearest enemies; 9s cooldown.
- **P** or the pause button pauses the run. Leaving the tab also pauses. Returning requires a deliberate resume, including audio unlock on iOS.
- Clear all enemies to choose power, vitality or attack speed. All blessings last for the current run. Survive escalating waves; every fifth wave includes a boss with an enraged second phase.
- The crystal is stationary. Enemies damage it on contact; boss attacks mark the ground before detonation. Time Frost Ward to interrupt them.
- Personal best persists locally when a run ends. Storage is optional; private-browsing failures do not block play.

## Broadcaster studio

On desktop, the studio sits beside the 9:16 game. On phones, use the controls icon in the header to open it; the drawer scrolls.

| Simulated gift | In-game interaction                                                 |
| -------------- | ------------------------------------------------------------------- |
| Rose           | Restore up to 25 crystal health                                     |
| Ice heart      | Freeze the horde for 5 seconds                                      |
| Meteor         | Firestorm damaging all enemies                                      |
| Crown          | Summon one Hollow King; if already present, restore up to 25 health |

More controls simulate joins, text chat, likes, follows and a simultaneous crowd. Automatic simulation sends one event every 5.5 seconds while the game is running and visible. Events are ignored during menus, pauses and game over. Acknowledgements use text nodes, never HTML from chat. Feeds and particle populations are bounded.

`?broadcast=1` opens a clean, independent 9:16 arena without the studio or site chrome, with additional space for platform overlays. **Tabs have independent runs; they are not synchronized.** To broadcast the studio-controlled run, crop your capture to its arena. A shared authoritative broadcast session is a future milestone.

## Architecture

```text
src/
  game/
    engine.ts             Browser-independent rules, wave/upgrade state machine
    types.ts, config.ts   Typed state, events and balancing
    scenes/ArenaScene.ts  Phaser lifecycle, fixed simulation step and atmosphere
    entities/CombatView.ts Arcade bodies and authoritative browser overlap checks
    effects/Effects.ts    Phaser particles, rings, lightning and damage labels
  integrations/
    events/types.ts       EventProvider and discriminated LIVE-event union
    mock/MockProvider.ts  Local events, auto simulation and crowd generator
  ui/                     HTML overlays, studio, event acknowledgements, icons
  audio/Sound.ts          Gesture-gated synthesized Web Audio; silent fallback
  assets/                 Editable original SVG sources
public/assets/            Generated runtime PNGs and six-frame sprite sheets
scripts/generate-assets.mjs Reproducible original art pipeline
```

The rules use seconds and a 450×800 logical world; the clean broadcast renderer uses a native 1080×1920 canvas. Phaser runs a capped, fixed 60Hz simulation. The browser uses Arcade Physics for bolt/enemy, enemy/crystal and hostile bolt/crystal overlaps. A geometric collision fallback allows the same rules to run without Phaser in unit tests. Rendering never owns damage or scoring rules.

`EventProvider` defines `ViewerJoined`, `ChatMessage`, `LikeReceived`, `GiftReceived` and `FollowReceived`. A future connector belongs outside Phaser, behind this interface, with server-side authentication, schema validation, deduplication and rate limiting. Never put TikTok credentials in client environment variables.

## Assets and performance

The arena, four monster sheets, crystal, guardian, torches and effects are **original vector illustrations**, authored for this repository. Rebuild with `npm run assets`. See [ASSETS.md](ASSETS.md) for provenance, licenses and visual scope. Manrope and Cormorant Garamond are self-hosted under the SIL Open Font License; licenses ship with the fonts. No runtime asset or font requests leave the site.

The renderer chooses WebGL with a Canvas fallback. The arena texture is rasterized from vector source at 1080×1920. WebGL adds a crystal glow; both modes retain additive lights and spell particles. Decorative firefly density drops and the optional glow shader is removed after sustained slow frames. Enemy and particle populations are capped; fonts and assets are local; Phaser is split into a cacheable vendor chunk. A 60 FPS target is not a guarantee on all iPhones.

## Netlify

Connect this repository in Netlify and select the feature branch for a preview (or main after merge). `netlify.toml` sets Node 22, **`npm run build`**, and **`dist`**. No functions, database or environment secrets are needed. This change configures hosting; it does not create a production site or claim a deployed URL.

## Validation and remaining work

Tests cover real combat and scoring, cooldowns, pause/resume, full-wave clearance, upgrades, every-fifth-wave bosses, gifts, death/restart, provider lifecycle, bounded text and particles. Playwright runs the production bundle in desktop Chromium and iPhone-emulated WebKit, including mock events, a chat-injection regression and portrait/broadcast layout checks. Two additional browser integration checks use a Vite development server to set up deterministic enemy contact and verify the actual Arcade collision bodies and freeze behavior without a production debug API. Screenshots are captured in `test-results/` and uploaded by CI; selected captures are in [docs/screenshots](docs/screenshots).

This is a polished playable **vertical slice**, not a finished commercial release. Physical iPhone Safari testing, a long-stream soak, device profiling, expanded animation/audio, more environments, accessibility refinements and later-wave balance remain. Headless WebKit is useful coverage but is not physical Safari certification. Generated vector art is cohesive and playable; a final commercial art pass should add painted material detail, attack/death clips and richer boss animation. See [ASSETS.md](ASSETS.md).

CI builds and runs both test suites on pull requests. No real TikTok connection is claimed or implemented.
