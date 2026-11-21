# LIVE collector and delivery contract

The Railway deployment starts in simulation mode. Use the settings below to connect a TikTok account and verify it with a short LIVE test.

## Server collector

`server/live/euler.ts` uses the existing `ws` dependency to consume Euler Stream’s JSON WebSocket protocol, explicitly requesting schema v3, bundled events and decoded JSON. It adds no protobuf SDK or TikTok credentials. The implementation was checked against [Euler’s WebSocket API](https://www.eulerstream.com/docs/api/tiktok-web-socket-api) and the upstream [protocol/types](https://github.com/EulerStream/Euler-WebSocket-SDK/tree/main/src). Synthetic protocol fixtures are tests, not recorded production traffic.

To connect the collector, set both **server-only** variables:

```dotenv
TIKTOK_USERNAME=your_username
EULER_API_KEY=your_provider_key
```

This configuration can test real chat, likes and follows. Set `TIKTOK_CREATOR_ID` to the broadcaster's numeric user ID before testing real gifts. The collector ignores gifts until the recipient check can run. Leave the variables unset for a simulated game. Euler access, account permissions and quotas are separate from Railway hosting.

Use a fresh persistent state volume, `TEAM_DEMO_JOIN=false`, `TEAM_SEED_DEMO=false` and automatic demo events OFF for real broadcasts. The collector runs independently of the broadcaster’s computer/phone. It is attached to a username’s LIVE room, so it can receive events while that account broadcasts from either device. **Showing the game video inside a phone LIVE still needs an approved screen-sharing/broadcast workflow available to that account.** Receiving chat/gifts on the server does not inject a browser source into the TikTok phone app.

## Events and mapping

The JSON adapter handles `WebcastMemberMessage`, `WebcastChatMessage`, `WebcastLikeMessage` (`count`, not cumulative `total`), `WebcastSocialMessage` follow action 1, and `WebcastGiftMessage`. Shares, envelopes, gift broadcasts, goals and unsupported classes never count as paid gifts. Unsupported data increments an ignored counter; malformed recognized data increments an invalid counter. IDs remain strings, including 64-bit user/room/message/gift/group IDs.

The authenticated stream supplies a room ID; gifts must also target the configured creator ID. Guest/PK-recipient or foreign-room gifts are filtered. Missing sender/message/recipient/gift-type information is a visible validation error; the adapter does not guess an economic identity.

A gift ID first seen from the provider is persisted in the catalog. Its default action is **cosmetic thanks**, including new/seasonal/regional IDs. In `/teams-admin.html`, the operator maps a stable ID to `reinforce`, `shield`, `boost`, `meteor` or `thanks`. Localized gift names are display metadata only. Mappings affect future units, never reinterpret previously received gifts. There is no claim that every gift has a unique custom combat animation, or that unsupported provider messages are covered automatically.

With a stable group/series ID, a durable watermark applies only the increase in cumulative repeat count. `1 → 3 → 2 → final 3 → late 5` credits exactly five units. The key includes room, sender, recipient, gift and series. It survives restarts. Without a stable series ID, progress messages wait for the final message; repeated finals must preserve their message ID. Two independent finals with different IDs cannot safely be inferred to be the same streak. An upstream source must provide stable identifiers for reliable replay.

## Durable gameplay delivery

The normalized internal `/api/teams/events` endpoint remains available for trusted adapters and mocks. Raw provider-shaped events use the separate bearer-protected `/api/teams/live/events` endpoint after the server has a room/creator binding (normally established by the included collector). Its gift payload is:

```json
{
  "id": "provider-message-id",
  "roomId": "room-id-as-string",
  "type": "gift",
  "viewer": { "id": "viewer-id", "name": "Luna" },
  "recipientId": "creator-id",
  "giftId": "provider-gift-id",
  "giftName": "Display name",
  "count": 3,
  "streak": true,
  "streakEnd": false,
  "seriesId": "stable-provider-group-id"
}
```

Gift counters and like deltas must be integer 1–1,000,000. There is no silent truncation. Internal gift effects are deliberately capped for game balance; receipts report actual spawned allies/seconds/targets, with cosmetic acknowledgement of overflow. No enemy target also gets a truthful cosmetic outcome. A gift without a team waits until that viewer chooses a side. Pause and round results delay delivery until the next active battle. A confirmed LIVE end closes any remaining queue items as cosmetic acknowledgements. Gift receipts, catalog mappings and replay protection stay in SQLite.

SQLite atomically commits the economic receipt, watermark, inbox and resulting game state. A retry returns the current queued/applied/cosmetic result. A conflicting economic payload using the same ID fails. Profile changes are harmless. Failed database transactions do not consume a streak increment. Receipts and watermarks have no automatic count-based eviction; watch volume size, back up and archive deliberately. Earlier versions’ already-rejected receipts retain their historical result and are not retroactively charged again.

Registered players are independent of on-screen avatars. Up to 80 main avatars rotate by least-recently-played round, reserving 40 per team where possible and filling unused places. Registered viewers’ likes count toward the team heal goal and their personal progress in the current round. Both reset at the next round. Follows and configured team gifts still support their registered team. Total rendered fighters remain at most 100 including temporary allies.

## Operational visibility and remaining rehearsal

The admin-only diagnostics endpoint exposes connection state, last valid event time, ignored/invalid counters, close code, registered team totals, pending count, the latest 50 gift outcomes and observed gift mappings. API keys and authenticated URLs are excluded. Browser WebSocket connectivity and upstream TikTok connectivity are separate indicators.

The arena waits with an empty field until the collector verifies a room. The same room resumes after a temporary disconnect or server restart. A confirmed end or a different LIVE room resets the roster, scores, round and like progression. The collector handles heartbeat failure, retry backoff up to 60 seconds, and provider quota errors. Invalid credentials/configuration/permission closes stop automatic retry so an operator can fix the server configuration. Never print provider error objects because they may contain the authenticated URL.

**Delivery boundary:** the provider protocol does not expose a durable replay/acknowledgement mechanism here. Events never delivered during a provider outage, malformed unsupported payloads, or storage failure before a successful commit cannot be guaranteed recovered by this app. A reconnect is not evidence that missed paid gifts were replayed. Inspect diagnostics and reconcile with the provider. Do not advertise financial-grade or universal exactly-once delivery.

Before real gifts: deploy one Node instance with HTTPS/WebSocket support and a persistent SQLite volume; configure the account/provider; map the desired catalog IDs; verify one LIVE from computer and one from phone, including a real streak, follow, like batch, disconnect/reconnect and next round. Confirm the phone’s video/screen-sharing path separately. Physical iPhone Safari, long-stream FPS and the provider’s live region-specific payloads remain manual checks. This is the real-account rehearsal still required after Railway is configured.
