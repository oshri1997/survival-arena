# Survival Arena LIVE

**New: Red vs Blue Team Arena** — the server-synchronized viewer battle inspired by the supplied TikTok reference. Run `npm ci && npm run teams`, open `/teams.html`, and use `/teams-admin.html` for protected controls. Includes persistent rounds, original profile avatars, territory combat, four gifts and an authenticated event ingestion endpoint. No real TikTok connection is active. See [setup, API contract and Node deployment](docs/team-battle.md). For a static playable preview use `/teams-demo.html` or `npm run build:demo` and publish `dist-demo/`; this is explicitly local and has no shared server. The existing crystal defense below remains available at `/index.html`.

[Play the updated movement demo](https://oshri-survival-arena-patrol.mikaoshriai.chatgpt.site) (owner-private local simulation). Avatars patrol their own territory with smooth steering and continue shooting at nearby opponents.

Before using real viewer gifts, read the [LIVE readiness audit](docs/live-readiness-audit.md). Gift-ID catalog mapping, streak normalization and durable pending-gift handling still need integration work.

A game-first fantasy defense arena for TikTok LIVE-style broadcasts. The game opens directly into combat, fills the viewport, and shows only **wave, crystal health and four viewer interactions**. The guardian defends automatically; waves, upgrades and new rounds continue without menus.

TikTok interactions are **simulated** in both modes. No TikTok account, credentials, payment integration or real live event connector is present. The crystal game below uses local events; Team Arena supports a shared server.

## Run and play

Node 22+:

```sh
npm ci
npm run dev
```

- **`/`** — full-screen viewer game. Works in portrait, landscape and a 1080×1920 browser source.
- **`/admin.html`** — separate broadcaster controls. Open the game in the same browser first, or use **Open game** in the admin page.
- Optionally add the same `?session=my-stream` to both URLs to isolate sessions.

The goal is to protect the glowing crystal. Enemies attack it, automatic bolts defeat them, and every fifth wave brings a boss. A pink targeting ring and beam show the boss winding up. Freeze interrupts the attack. At half health the boss attacks faster. Clear a wave to receive an automatic power, attack speed or vitality blessing. After defeat, the game restarts in 4.5 seconds; the play button restarts sooner.

| Simulated interaction      | Visible effect                                             |
| -------------------------- | ---------------------------------------------------------- |
| Rose                       | Restore up to 25 crystal health                            |
| Ice heart                  | Freeze enemies for 5 seconds and interrupt a charging boss |
| Meteor                     | A falling meteor damages the horde on impact               |
| Crown                      | Summon a named boss, or heal if a boss is already present  |
| 20 likes                   | Charge one lightning strike that fires when ready          |
| Follow                     | Restore up to 5 health                                     |
| Chat `fire`, `ice`, `bolt` | Cast the corresponding ability if ready                    |

The four small gift controls on the viewer screen let you try the interactions without TikTok. **SIM** identifies this mode. Admin supports all five typed event categories, crowd simulation, auto events, direct abilities, pause/resume, restart and sound. Keyboard alternatives: Q / W / E for spells, P to pause.

## Viewer/admin separation

The game and admin are separate Vite HTML entries. The admin bundle does not load Phaser. A same-origin `SessionBus` passes validated mock commands and small state snapshots over `BroadcastChannel`. A bounded local-storage queue with event and polling delivery supports browsers where that API is unavailable or storage events are delayed. These are **same-browser controls**, not a networked or authenticated server dashboard. Use one game tab per session; multiple viewer tabs are independent simulations.

The game continues headless simulation while its tab is hidden so the studio can operate it. Browsers, especially iOS, can suspend background tabs entirely; keep the viewer window visible during a stream. A future shared session service should replace local transport before multi-device broadcasting.

## Build and verify

```sh
npm run build              # strict TypeScript + production output in dist/
npm run preview
npm test                   # engine, mock provider and command validation
npx playwright install --with-deps chromium webkit
npm run test:e2e            # production UI + source-level physics integration
npm run format:check
npm run assets             # deterministic original art pipeline
```

Browser tests check direct entry into combat, at least 80% viewport coverage (the canvas fills the viewport), no dashboard/menu elements in the game, responsive resize, cross-tab admin gifts and pause, combat scoring, safe chat text, the local-storage transport fallback, enlarged Arcade collision bodies, freeze protection and menu-free wave progression. Projects cover desktop Chromium and iPhone-emulated WebKit. Physical iPhone Safari and device FPS/long-stream profiling remain to be done.

## Architecture

- `src/game/engine.ts`: browser-independent rules, responsive world bounds, waves, upgrades and combat.
- `src/game/scenes/ArenaScene.ts`: Phaser 3.90 lifecycle, responsive scene, fixed-step visible simulation.
- `src/game/entities/CombatView.ts`: Arcade collision authority and animated enemy/bolt sprites.
- `src/game/effects/Effects.ts`: fire, frost, lightning, meteors, impacts, particles and damage numbers.
- `src/ui/Controller.ts`: minimal audience UI, automatic progression and mock event effects.
- `src/admin.ts`, `src/ui/admin-layout.ts`: separate broadcaster interface.
- `src/integrations/events`, `mock`, `local`: typed provider boundary, local simulator and validated tab transport.
- `src/audio/Sound.ts`: gesture-gated synthesized Web Audio with silent fallback.
- `scripts/generate-assets.mjs`, `src/assets`, `public/assets`: original editable art and generated runtime textures.

The rendering world is 800 logical units high and adapts its width to the viewport. Simulation uses a capped 60Hz fixed step; background simulation uses the same engine with headless collision checks. Decorative particles are reduced after sustained slow frames. Character art is larger and color separates the cyan crystal/blue guardian from warm enemies. Original effect textures replace generic projectile dots. Game CSS was reduced from the former dashboard layout to a small full-screen HUD.

## References and assets

The redesign was informed by actual interactive TikTok LIVE games: **Hold the Line**, **Tower Siege**, and **King of the Hill**. See [the research notes](docs/design-inspiration.md) for source links and the specific principles applied. Reference screenshots were reviewed only; no third-party artwork was copied into the game.

All game art is original vector illustration. Fonts are self-hosted with their licenses. See [ASSETS.md](ASSETS.md). This remains a stylized playable vertical slice; dedicated attack/death clips, painted material detail, mastered audio and later-wave balancing remain commercial production work.

## Netlify

`netlify.toml` uses Node 22, `npm run build`, and `dist`. Both HTML entries are included automatically; no server functions or secrets are needed. `.netlify/` state is gitignored. Anonymous previews must be claimed into a Netlify account within one hour to keep them.

Future real LIVE connectors belong outside the game engine with server-side credentials, authentication, validation, deduplication and rate limiting. Never put TikTok credentials in a frontend bundle.
