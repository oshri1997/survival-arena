# TikTok LIVE readiness audit · 2026-11-20

The previously identified application blockers have now been implemented and tested with synthetic events and a local provider socket. No real TikTok account is connected. See [delivery semantics and the remaining real-account rehearsal](live-integration.md).

| Previously open issue                                    | Implemented behavior                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No upstream collector                                    | Optional server-only Euler Stream JSON collector; disabled unless configured                                          |
| Four internal names were mistaken for a catalog          | Durable gift-ID catalog, explicit admin mapping and cosmetic fallback for new IDs                                     |
| Cumulative streaks could double count                    | Durable high watermark scoped by room/sender/recipient/gift/series; duplicate/out-of-order/final coverage             |
| Large gift/like batches rejected at 20/100               | Integer counts up to 1,000,000, bounded combat effects and explicit actual-effect receipts                            |
| Result/pause/pre-team gifts lost                         | Durable pending inbox, first-team binding, next-active-battle drain and current outcome on retries                    |
| Full arena silently applied only some allies             | Requested/spawned counts and cosmetic overflow; 80 active main avatars plus up to 20 reserved ally places             |
| 100 permanent heroes blocked all future viewers          | Independent registered roster with fair round rotation; waiting team members still interact                           |
| Receipt pruning allowed old gift replay                  | Removed automatic 20,000-receipt pruning; persistent receipts/watermarks, disk/backups remain operational work        |
| Wrong room / PK recipient / unsupported paid-like events | Explicit scope filter, strict recognized payload validation, no economic effects from broadcast/envelope/goal classes |
| No upstream connection status                            | Separate admin-only state, last event, invalid/ignored counts and close codes; safe reconnect/auth/quota behavior     |

Earlier fixes remain covered: likes do not shorten a longer gift boost; team switching cannot heal or skip respawn; conflicting event IDs are rejected; profile enrichment does not cause double application; admin toggles resist delayed/stale acknowledgements; production keys are mandatory; process crash/reopen preserves acknowledged events and revokes old admin sessions.

New tests exercise a real local WebSocket provider through normalization, SQLite and the authoritative game; HTTP authorization and mapping; cumulative counts before/after database reopen; no-series final handling; unknown gifts; foreign recipients/rooms; full-capacity outcomes; 125 registered viewers; database rollback; retention beyond 20,000 events; malformed frames and provider offline/authentication closes. Browser coverage includes queued pause/resume delivery in Chromium and iPhone-emulated WebKit. See the PR for actual run counts/results.

## Remaining external validation

1. Configure Railway (one instance, persistent volume, HTTPS/WebSockets, server secrets); this has intentionally not been done yet.
2. Supply the broadcaster username, numeric creator ID and a suitable provider key/plan on the server, without sending a TikTok password.
3. Map the desired real gift IDs. All unseen IDs have a safe cosmetic fallback, not a promise of a custom animation for every catalog item.
4. Rehearse actual LIVE events, regional catalog payloads, account eligibility and provider delivery/replay behavior. The provider cannot be tested against this account until configured.
5. Validate physical iPhone Safari and phone LIVE screen sharing/video capture. The cloud collector can receive events independently of the PC; displaying the game in a phone broadcast is a separate account/device capability.

Passing synthetic tests does not prove upstream event delivery, recovery of events never received, real TikTok permissions or physical-device performance. Provider outages, ambiguous IDs and pre-commit storage failures remain explicit delivery boundaries, documented in the integration guide.
