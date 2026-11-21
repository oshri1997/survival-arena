# Red vs Blue · Team Arena

Before connecting a real LIVE, read the [readiness audit](live-readiness-audit.md) and [provider setup/delivery contract](live-integration.md). Gift-ID mapping, streak normalization and durable round-boundary delivery are implemented; real-account and physical-phone validation remain.

A working, server-authoritative multiplayer broadcast game inspired by the red/blue territory format in the supplied reference. It is original code and artwork, not a copy of another game's assets. This mode is separate from the earlier fantasy crystal defense.

## Play

Use Node **24 LTS** (built-in SQLite is required; minimum Node 22.13).

```sh
npm ci
npm run teams
```

Open `http://localhost:8787/teams.html`. Admin: `/teams-admin.html`. On this server `/` also opens the team game; `/index.html` retains crystal defense. In development, missing keys are generated and printed **only in the server terminal**. With `NODE_ENV=production`, both keys must be configured or startup fails. Configured keys are never printed or included in Vite output. To set stable keys:

```sh
cp .env.example .env
# Replace both example keys, then:
node --env-file=.env --import tsx server/index.ts
```

Build first with `npm run build`. For hot frontend editing, run `npm run teams:server` and `npm run dev` in separate terminals; Vite proxies HTTP and WebSocket traffic to port 8787.

The seeded demo has 24 fictional viewers and automatic shield/power events. Join either side with the two touch buttons. Each browser receives its own server-issued viewer cookie. In admin, turn automatic events off, choose a viewer ID/name/team, join, send chat, likes, follows or one of four gifts. `+8 viewers` simulates concurrent participants. Pause/resume/new round operate on the shared server, across browsers/devices. Admin sessions persist across page reloads; signing out revokes the session. Sessions expire after 12 hours or server restart.

## Static playable preview

[Updated movement demo](https://oshri-survival-arena-patrol.mikaoshriai.chatgpt.site) is hosted as an owner-private Site. It is the local simulation below, not the authoritative Node server. The generated preview checkout is `/workspace/sites/survival-arena-patrol`; its tracked `.openai/hosting.json` retains the Site identity for later updates. Publish a fresh `dist-demo/` build through that checkout when updating the preview.

`/teams-demo.html` is an explicitly labeled **LOCAL DEMO** using the same rules and renderer inside the browser. It starts immediately, accepts team joins and simulates all four gifts. It makes no API calls, has no server/admin access, and resets on refresh. Each visitor has an independent demo. It is intentionally separate from `/teams.html`, which always requires the authoritative server and never silently falls back.

```sh
npm run build:demo
# Publish dist-demo/ to a static host for a visual/playable preview only.
```

`dist-demo/` exposes the demo at `/` and excludes the networked game/admin HTML pages. It is ignored by Git and Docker. This static preview does not replace the full server deployment below.

## Game rules

- Chat `red` / `1` or `blue` / `2` selects a side. One persistent fighter per viewer ID; switching sides removes that viewer's old temporary allies.
- Avatars patrol independent waypoints throughout their own territory, with smooth acceleration, varied speeds and crowd separation. When both sides are present with up to six fighters total, avatars move faster and seek the closest opponent from their own territory. They return to roaming once they close the gap. The renderer and server share the same curved boundary, including when territory shrinks. Avatars lose health, earn kills/stars and respawn after 3 seconds. Combat resolves attacks together so roster order does not grant a first strike.
- Each kill moves territory 1.2 percentage points. Reach 90% or lead when the two-minute timer ends to win. Results display for 8 seconds, then the next round starts automatically. Ties are draws. Registered viewers retain their teams; up to 80 main avatars rotate fairly per round, reserving space for allies.
- **Reinforce**: three temporary allies per unit. **Shield**: 75% damage reduction for 6 seconds/unit, capped at 18 seconds. **Meteor**: 55 damage/unit to up to ten opponents near the front. **Boost**: double attack power for 8 seconds/unit, capped at 24 seconds.
- Every 20 likes banks four seconds of double damage, up to 16 seconds per team. That charge is spent while the team has an opponent in range and resets at the next round. Like and gift power both give double damage and do not stack. A follow heals living teammates by 25 HP.
- Cap: 100 fighters including temporary allies. Additional viewers register for fair round rotation and can still send team interactions. Gift capacity/duration overflow receives a cosmetic acknowledgement with the actual applied count in admin receipts. No prizes, gambling, paid random rewards or location tracking.
- Sound starts after touching/clicking the game, as required by Safari. `M` toggles local sound. Original synthesized effects remain optional; all actions have visible feedback.

## The remaining TikTok connection

The `server/live/euler.ts` collector connects to Euler Stream’s JSON WebSocket service when `TIKTOK_USERNAME` and `EULER_API_KEY` are set. It handles viewer arrival, team chat, like deltas and follows. Add `TIKTOK_CREATOR_ID` to enable gift delivery with recipient filtering and durable streak accounting. Read [LIVE integration](live-integration.md) for configuration, mapping and delivery boundaries.

### Ingestion

`POST /api/teams/events`, `Authorization: Bearer <TEAM_EVENT_KEY>`, JSON:

```json
{
  "id": "stream-123:chat:provider-message-456",
  "type": "chat",
  "viewer": {
    "id": "stable-provider-viewer-id",
    "name": "Luna",
    "avatar": "https://your-provider.example/avatar.jpg"
  },
  "message": "red"
}
```

`avatar` is optional. HTTPS images must allow anonymous CORS access; otherwise an original illustrated avatar remains visible. URLs with embedded credentials are rejected. Viewer names render as text, never HTML.

| Source event            | `type`         | Additional fields / behavior                                                                                                                |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ViewerJoined            | `viewerJoined` | Arrival acknowledgement; does not choose a team                                                                                             |
| ChatMessage             | `chat`         | `message`: 1–200 chars; team keywords select a side                                                                                         |
| LikeReceived            | `like`         | `count`: integer 1–1,000,000; registered team members contribute even when waiting for an avatar                                            |
| FollowReceived          | `follow`       | Registered team members heal their team; unassigned follows get a cosmetic acknowledgement                                                  |
| GiftReceived            | `gift`         | `gift`: `reinforce`, `shield`, `meteor`, `boost`, `thanks`; `amount`: integer 1–1,000,000, default 1; optional `team` overrides viewer team |
| Internal team selection | `join`         | `team`: `red` or `blue`                                                                                                                     |

Event envelopes reject unrecognized fields; do not post raw provider objects or cumulative counters directly. Every event requires a stable unique `id` (1–160 chars), and a `viewer` with stable `id` (1–100 chars) and `name` (1–32 chars). Namespace event IDs by stream/session. The provider should send a completed gift streak once, or distinct incremental deltas, never cumulative repeat counts as separate gifts. The separate `/api/teams/live/events` contract accepts provider gift IDs and cumulative streak metadata; the included collector calls the same store directly. Both counters are bounded at 1,000,000; larger or invalid values produce a visible validation failure rather than truncation. The endpoint allows 200 requests per 10 seconds per source IP. Respect 429 and retry the **same ID** with backoff.

Examples from a connector host (keys are environment variables, not browser values):

```sh
curl --fail-with-body "$ARENA_URL/api/teams/events" \
  -H "Authorization: Bearer $TEAM_EVENT_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"id":"stream1:join:42","type":"chat","viewer":{"id":"42","name":"Luna"},"message":"red"}'

curl --fail-with-body "$ARENA_URL/api/teams/events" \
  -H "Authorization: Bearer $TEAM_EVENT_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"id":"stream1:gift:99","type":"gift","viewer":{"id":"42","name":"Luna"},"gift":"meteor","amount":1}'
```

Success returns `accepted:true`, `duplicate:false` and, for gifts, `status: queued | applied | cosmetic`. `details` reports requested units and actual spawned allies, added seconds or affected targets. Repeating the same ID returns its **current stored outcome** without repeating gameplay. A changed economic payload with the same ID returns 409. Display-name/avatar enrichment does not count as a new gift. Legacy fingerprint receipts retain compatibility.

Gifts received during pause/results or before team choice enter a durable inbox. A teamless gift binds to the viewer’s first subsequent team choice; an already-bound gift keeps its team through switches. Up to 25 eligible pending gifts drain per simulation step. No team choice means the gift stays queued and visible to the admin. Unknown gift IDs default to `thanks`, which needs no team. Capacity and duration limits explicitly acknowledge overflow; they do not promise unlimited gameplay power.

Invalid data returns 400, absent key 401, rate limits 429, and temporary processing errors 503 (retry the exact same ID/payload). Receipt and game changes commit together. Receipts/streak watermarks are no longer automatically pruned at 20,000; back up the volume, monitor disk use and define an archive/replay policy before removing old data.

### Broadcast and production operation

1. Deploy the Node server with HTTPS and WebSocket upgrade support. Attach persistent storage at `TEAM_STATE_PATH`.
2. Set separate, random `TEAM_ADMIN_KEY` and `TEAM_EVENT_KEY` server secrets.
3. For a real connected broadcast set `TEAM_DEMO_JOIN=false`, `TEAM_SEED_DEMO=false`, and use a **fresh state volume**. Seed flags only affect a new database. If reusing a demo database, automatic events remain saved until disabled in admin.
4. Use `/teams.html` in a 1080×1920 OBS/TikTok LIVE Studio browser source. Open `/teams-admin.html` in a separate ordinary browser, sign in, keep its key private.
5. Configure the optional collector or a compatible protected server-side event provider using [LIVE integration](live-integration.md). Viewer WebSockets are read-only; sending a command closes that socket. Admin actions require an HttpOnly/SameSite session and reject cross-origin requests.

```sh
docker build -t survival-arena .
docker volume create arena-data
docker run -d --name arena --restart unless-stopped \
  --env-file .env -p 8787:8787 -v arena-data:/app/data survival-arena
```

For a Node host without Docker, install build dependencies explicitly before starting the production process:

```sh
npm ci --include=dev
npm run build
# Set .env to production keys, a fresh persistent state file and both demo flags=false.
NODE_ENV=production node --env-file=.env --import tsx server/index.ts
```

Put a TLS reverse proxy in front and forward `/api/teams/socket` upgrades. Node serves both the production static assets and API on one origin. The Docker image is supplied for deployment. On networks with a corporate TLS proxy, the optional BuildKit secret `--secret id=npm_ca,src=/path/to/trusted-ca.pem` trusts that CA only during dependency installation; it is not copied into the image. See PR validation for build/run results.

**This mode requires a running Node process.** Netlify's existing static configuration still serves the original crystal game; uploading only `dist/` cannot run the new battle server. A static-only deployment of the team UI would keep reconnecting. Use a persistent Node/container host for this version. Quick-tunnel links are temporary previews tied to the development environment, not permanent hosting.

## Architecture and limits

- `src/teams/contracts.ts`: validated event protocol, limits and state types.
- `src/teams/Battle.ts`: renderer-free combat/round rules; sole authority on the server.
- `src/teams/Patrol.ts`, `territory.ts`: autonomous steering, collision avoidance and shared territory constraints. Old saved games without velocity fields remain readable; new patrol routes are chosen after a server restart.
- `server/app.ts`: HTTP authentication, ingestion, mock automation, static hosting, 20 Hz simulation, 10 Hz snapshots and WebSocket backpressure.
- `server/store.ts`: SQLite WAL state, registered roster, pending gifts, catalog and receipt/streak ledgers; one-second routine checkpoints, immediate writes for event/admin commands. Sudden power loss may lose up to one second of ordinary combat, but acknowledged event writes are transactional.
- `server/live/contracts.ts`, `euler.ts`: validated provider boundary and optional independent cloud collector; no frontend credentials.
- `src/teams/Client.ts`: same-origin WebSocket client, automatic reconnect and fresh state after reconnect.
- `src/teams/TeamScene.ts`, `avatars.ts`: Phaser renderer, cached hex field, smooth avatar motion, health/stars/projectiles/impact effects, original generated profile art and optional provider avatars.
- `src/teams/main.ts`, `admin.ts`, `style.css`: separate minimal audience screen and authenticated control room.

One server process owns one arena. Do not horizontally replicate it against a shared SQLite file. Up to 100 viewer sockets are allowed; these are browser sources/control displays, not a socket per person watching the TikTok video. Large streams need provider aggregation, external observability, backups and load testing. This version does not include horizontal scaling or an operator account recovery system. Physical iPhone Safari and long-duration/device FPS profiling remain manual validation.

Tests cover movement/combat fairness, all gifts, round results/restart, pause, caps, input validation, durable deduplication after reopening storage, event/admin authorization, logout, read-only sockets, multi-client synchronization, viewer identity, mobile layout, safe names and cross-browser admin effects. Run `npm run build`, `npm test`, `npm run test:e2e`, `npm run format:check`. Playwright covers Chromium and iPhone-emulated WebKit, not physical hardware.
