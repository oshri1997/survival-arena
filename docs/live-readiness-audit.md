# TikTok LIVE readiness audit · 2026-11-20

The game accepts normalized mock/connector events. **It is not yet connected to TikTok, and it does not currently cover every real TikTok gift.** Four game effects are not a TikTok gift catalog. A passing test for explicit rejection is evidence of known behavior, not evidence that a missing workflow has been implemented.

## Fixes made during this audit

- Like batches no longer reduce a longer active gift boost to the shorter like cap. Like power and gift power share one timer and do not multiply into quadruple damage.
- Switching teams preserves wounds and a pending respawn timer. Repeating chat keywords cannot refill health or resurrect a defeated avatar.
- New durable receipts include a SHA-256 fingerprint of the normalized payload. Repeating a matching ID/payload returns its stored result; reusing that ID with a different payload returns a conflict without applying it. Existing SQLite databases migrate in place. Legacy receipts without a fingerprint still suppress retries but cannot detect historical payload collisions.
- Receipt pruning now breaks identical timestamp ties with insertion order, preserving the newest receipts deterministically.

## Checked behavior and boundaries

| Case                                                       | Verified behavior / coverage                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `red`, `blue`, `1`, `2`, case and surrounding spaces       | Team selection; one main avatar per viewer ID                                          |
| Ordinary chat / viewer arrival                             | No team combat power; arrival alone does not select a team                             |
| Likes at 19/20/21/40/100                                   | Threshold, remainder, duration caps and separate team totals                           |
| Likes from multiple teammates                              | Combined team charge; no power credited to the opposite side                           |
| Likes while gift power is already 24 seconds               | Existing power preserved; no accidental reduction                                      |
| Follow                                                     | Heal living teammates by up to 25 HP; no over-heal or revival                          |
| Team switch with wounds / while defeated                   | Health and respawn delay preserved; old temporary allies removed                       |
| All four effects, quantity 1 and 20                        | Valid normalized quantities; bounded health, timers and fighter counts                 |
| Shield                                                     | 75% ordinary/meteor damage reduction, cap and timer expiry                             |
| Meteor                                                     | At most ten living opponents; no friendly damage; one score per defeated opponent      |
| Gift targeting a team different from the sender's          | No kill credit to a sender fighting for the opposing team                              |
| Reinforcements                                             | Three temporary allies per unit, bounded at 100 fighters; defeated allies expire       |
| Pause                                                      | Simulation and buff countdowns freeze; event ingestion remains available during battle |
| Same event ID/payload, including reordered object fields   | Idempotent durable receipt                                                             |
| Same event ID with a changed quantity                      | Explicit conflict; no second gameplay application                                      |
| Process/storage reopen and existing schema                 | Persisted receipts and state; compatible fingerprint migration                         |
| Authorization / bad payload / wrong origin                 | Existing server tests cover rejection, admin login/logout and read-only viewer sockets |
| Motion, combat, scores, results, automatic restart         | Existing engine/patrol tests and browser scenarios                                     |
| Browser reload / different viewer browsers / mobile layout | Existing Chromium and iPhone-emulated WebKit coverage; no physical-phone claim         |

## Open blockers before using real viewer gifts

1. **No upstream LIVE connector.** The application has an authenticated normalized event endpoint, not a TikTok subscription. A real provider and its server-side credential/configuration remain necessary.
2. **No real gift-ID catalog or fallback.** Incoming `gift` values are exactly `reinforce`, `shield`, `meteor`, `boost`. Raw gifts such as `Rose`/numeric IDs are rejected. Fetch the current room/provider catalog, map by ID rather than localized name, and give unknown/seasonal gifts an explicit acknowledgement policy. Do not claim full catalog coverage from a hardcoded list of names.
3. **No streak normalizer.** Cumulative updates 1, 2, 3 must total three gifts, not six. Process final streaks once or durable count deltas. Handle final flags that vary by provider/version, duplicate/out-of-order frames, missing metadata, and reconnection. Do not count gift UI/goal/broadcast notifications as additional gifts. Filter recipient/room IDs so PK/co-host gifts are not assigned to this arena incorrectly.
4. **No durable pending-gift inbox.** During the eight-second result phase, all four gift types currently return a terminal 409. That rejection is saved, so retrying the same ID after restart will not apply it. Gifts from an unassigned viewer without explicit team are also rejected. Before real gifts, add durable receipt/application separation, an explicit policy for team assignment and round boundaries, and visible pending/applied/acknowledged status. Never fabricate a new ID simply to bypass a rejected receipt.
5. **Capacity policy is incomplete for real gifts.** At 100 fighters reinforcement is rejected. If only one slot remains, a larger request adds just one ally. Add truthful applied/requested counts and a documented queue or cosmetic acknowledgement for overflow; do not promise units that cannot appear.
6. **Large counts need normalization.** Gift quantities above 20 and like batches above 100 are rejected. A connector must split/aggregate with stable namespaced IDs, keep a durable outbox and retry transient errors/429 with backoff. Room-wide cumulative likes must not be used as each viewer's incremental likes. Preserve per-room event ordering and the chosen team policy so a delayed gift is not silently attributed to a different team after a switch. Ordinary chat that is not a game command should be acknowledged/ignored by the bridge rather than blindly retried.
7. **Deduplication is bounded.** Only the latest 20,000 receipts are retained. The production connector must persist replay watermarks/outbox state and define a matching replay horizon. Keep stream/room/message/streak identifiers as strings so 64-bit provider IDs do not lose precision, and namespace IDs by stream. Persist exact normalized payloads for retries instead of rebuilding them with updated profile metadata. Replaying receipts older than that limit can apply them again. No end-to-end exactly-once claim is made across an unspecified provider.
8. **Connection lifecycle and operations are not implemented upstream.** Offline/not-LIVE, room changes, stream end, rate limits, stale connection alerts, reconnect and credential rotation still need a provider-specific integration test. Browser WebSocket reconnect is already implemented; that does not subscribe the server to TikTok.
9. **Broadcasting is separate from event collection.** The hosted Site is a local demo; it resets on reload and has no shared server/admin. Production needs a persistent Node server with HTTPS/WSS, monitoring and backups. An iPhone can display the game, but mobile LIVE screen sharing must be checked on the actual TikTok account/device. Switching to a camera-only LIVE does not automatically composite this browser game.

## Recommended route for this creator

The creator normally broadcasts from a PC and wants a phone option. Prefer a continuously running cloud game server and server-side LIVE event connector, so ingestion is independent of whether a PC is on. Euler Stream is one possible third-party provider; its documented API key is held on the server and streams are selected by username. Provider availability, permissions and quota must be checked before selection. TikFinity's documented desktop WebSocket requires its desktop application on the same computer, so that route alone is not a standalone-phone design.

PC display: add the production game URL as a 1080×1920 browser source in OBS/LIVE Studio. Phone display: verify Mobile Gaming/screen-share availability, then test foreground Safari display, audio, sleep/rotation and reconnection on the physical phone. The cloud server continues simulation independently; a suspended browser cannot render the game into a camera-only stream.

### Next implementation order

1. Obtain the creator's `@username` and choose/configure the event provider without putting secrets in chat or the browser bundle.
2. Fetch that stream's gift catalog and collect representative real payload fixtures. Define mappings plus unknown/unsupported-gift acknowledgements.
3. Implement the normalized bridge, durable inbox/outbox and streak/like handling. Close blockers 2–7 before inviting real gifts.
4. Deploy the authoritative Node server/connector; disable mock seeding, automatic mock events and public demo joining.
5. Run a controlled LIVE validation with the actual account: joins, team comments, likes, gifts/streaks, reconnect, round transitions and overflow. Then validate PC capture and the separate phone screen-share route.

## Primary sources checked

- [TikTok documented webhooks](https://developers.tiktok.com/docs/en/webhooks-events): not evidence of a general public LIVE gift/chat endpoint. Do not equate Login Kit access with a LIVE event feed.
- [TikFinity LIVE API](https://tikfinity.zerody.one/tiktok/dapi): its documented desktop WebSocket depends on the desktop app on the same computer.
- [Euler Stream libraries](https://www.eulerstream.com/docs/libraries): server-side signing key, username selection and real-time LIVE event libraries; third-party infrastructure, not TikTok's public developer API.
- [TikTok LIVE Connector gift semantics](https://ttlc.docs.isaackogan.com/events/gifts-and-goals/): cumulative repeat counts/final flags, missing optional metadata and separate gift/goal/envelope messages.
- [TikFinity PC/mobile broadcasting guide](https://blog.tikfinity.com/how-to-stream-games-on-tiktok-live-pc-mobile-guide/): screen-share route and PC capture options. Device/account availability remains to be checked directly.

Validation commands: `npm run build`, `npm test`, `npm run test:e2e`, `npm run format:check`. See the PR/check results for actual outcomes; live provider/account scenarios remain unverified until that connector exists.
