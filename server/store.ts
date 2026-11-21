import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  audienceEventSchema,
  MAX_ACTIVE_VIEWERS,
  selectedTeam,
  type BattleState,
  type AudienceEvent,
  type Team,
  type TeamGift,
  type Viewer,
} from '../src/teams/contracts';
import type { Battle, EventResult } from '../src/teams/Battle';
import { liveEventSchema, type LiveEvent, type LiveBinding } from './live/contracts';

type Receipt = EventResult & { duplicate: boolean };
type Gift = Extract<AudienceEvent, { type: 'gift' }>;
interface Pending {
  id: string;
  body: string;
  team: Team | null;
}
interface Member {
  id: string;
  body: string;
  team: Team;
  last_round: number;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** One SQLite transaction owns the event receipt, pending gift and resulting game state. */
export class Store {
  private db: DatabaseSync;
  private attached = false;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, result TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS events_created ON events(created);
      CREATE TABLE IF NOT EXISTS roster (id TEXT PRIMARY KEY, body TEXT NOT NULL, team TEXT NOT NULL, last_round INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS gifts (id TEXT PRIMARY KEY, body TEXT NOT NULL, team TEXT, status TEXT NOT NULL, result TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS gifts_pending ON gifts(status,created);
      CREATE TABLE IF NOT EXISTS streaks (id TEXT PRIMARY KEY, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS gift_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'thanks');`);
    const columns = this.db.prepare('PRAGMA table_info(events)').all() as { name: string }[];
    if (!columns.some((column) => column.name === 'fingerprint'))
      this.db.exec('ALTER TABLE events ADD COLUMN fingerprint TEXT');
  }
  restore(): BattleState | undefined {
    const row = this.db.prepare('SELECT body FROM state WHERE id=1').get() as
      { body: string } | undefined;
    return row ? (JSON.parse(row.body) as BattleState) : undefined;
  }
  save(state: BattleState) {
    this.db
      .prepare('INSERT INTO state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(JSON.stringify(state));
  }
  private attach(battle: Battle) {
    if (this.attached) return;
    for (const f of battle.state.fighters.filter((f) => !f.temporary))
      this.db
        .prepare('INSERT OR IGNORE INTO roster VALUES (?,?,?,?)')
        .run(
          f.ownerId,
          JSON.stringify({ id: f.ownerId, name: f.name, avatar: f.avatar }),
          f.team,
          battle.state.round,
        );
    this.attached = true;
  }
  private atomic<T>(battle: Battle, action: () => T): T {
    const before = structuredClone(battle.state);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.attach(battle);
      const result = action();
      this.save(battle.state);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      battle.state = before;
      this.attached = false;
      throw error;
    }
  }
  private member(id: string) {
    return this.db.prepare('SELECT * FROM roster WHERE id=?').get(id) as Member | undefined;
  }
  private apply(battle: Battle, event: AudienceEvent): EventResult {
    const team = selectedTeam(event);
    if (team) {
      this.db
        .prepare(
          'INSERT INTO roster(id,body,team) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,team=excluded.team',
        )
        .run(event.viewer.id, JSON.stringify(event.viewer), team);
      // A gift without a team binds to the first subsequent selection. Later switches do not redirect it.
      this.db
        .prepare(
          "UPDATE gifts SET team=?,result=json_set(result,'$.reason','Waiting for an unpaused battle') WHERE status='queued' AND team IS NULL AND json_extract(body,'$.viewer.id')=?",
        )
        .run(team, event.viewer.id);
      this.db
        .prepare(
          "UPDATE events SET result=(SELECT result FROM gifts WHERE gifts.id=events.id) WHERE id IN (SELECT id FROM gifts WHERE status='queued' AND json_extract(body,'$.viewer.id')=?)",
        )
        .run(event.viewer.id);
      const active = battle.state.fighters.some(
        (f) => !f.temporary && f.ownerId === event.viewer.id,
      );
      if (
        battle.state.phase !== 'battle' ||
        (!active &&
          (battle.state.fighters.filter((f) => !f.temporary).length >= MAX_ACTIVE_VIEWERS ||
            battle.state.fighters.length >= 100))
      ) {
        battle.acknowledge(event.viewer, 'registered · playing next available round', team);
        return {
          accepted: true,
          status: 'queued',
          reason: 'Registered for fair round rotation; team interactions are enabled',
        };
      }
      const result = battle.apply({ ...event, type: 'join', team });
      if (result.accepted)
        this.db
          .prepare('UPDATE roster SET last_round=? WHERE id=?')
          .run(battle.state.round, event.viewer.id);
      return result;
    }
    const member = this.member(event.viewer.id);
    if (event.type === 'viewerJoined') return battle.apply(event, member?.team);
    if (event.type === 'gift') {
      const target =
        event.team ??
        member?.team ??
        battle.state.fighters.find((f) => f.ownerId === event.viewer.id && !f.temporary)?.team;
      const result: EventResult = {
        accepted: true,
        status: 'queued',
        details: { requested: event.amount },
        reason:
          !target && event.gift !== 'thanks'
            ? 'Waiting for the viewer to choose red or blue'
            : 'Waiting for an unpaused battle',
      };
      this.db
        .prepare('INSERT INTO gifts VALUES (?,?,?,?,?,?)')
        .run(
          event.id,
          JSON.stringify(event),
          target ?? null,
          'queued',
          JSON.stringify(result),
          Date.now(),
        );
      const delivered = this.deliver(battle, {
        id: event.id,
        body: JSON.stringify(event),
        team: target ?? null,
      });
      if (!delivered)
        battle.acknowledge(
          event.viewer,
          !target && event.gift !== 'thanks'
            ? 'gift received · chat red or blue'
            : 'gift received · queued for battle',
          target,
        );
      return delivered ?? result;
    }
    if (event.type === 'chat') {
      const result = battle.apply(event, member?.team);
      return result.accepted
        ? result
        : {
            accepted: true,
            status: 'cosmetic',
            reason: 'Chat acknowledged; use red or blue to select a team',
          };
    }
    if (battle.state.phase !== 'battle') {
      if (event.type !== 'like') this.ack(battle, event.viewer);
      return {
        accepted: true,
        status: 'cosmetic',
        reason: 'Intermission interaction acknowledged; no combat effect',
      };
    }
    if (!member && (event.type === 'like' || event.type === 'follow')) {
      this.ack(battle, event.viewer);
      return { accepted: true, status: 'cosmetic', reason: 'Choose red or blue for team effects' };
    }
    return battle.apply(event, member?.team);
  }
  private ack(battle: Battle, viewer: Viewer) {
    battle.acknowledge(viewer, 'thanks · chat red or blue');
  }
  private deliver(battle: Battle, pending: Pending): EventResult | undefined {
    const event = JSON.parse(pending.body) as Gift;
    if (
      battle.state.phase !== 'battle' ||
      battle.state.paused ||
      (!pending.team && event.gift !== 'thanks')
    )
      return;
    const result = battle.apply({ ...event, team: pending.team ?? undefined });
    if (!result.accepted) return;
    this.db
      .prepare('UPDATE gifts SET status=?,result=? WHERE id=?')
      .run(result.status ?? 'applied', JSON.stringify(result), pending.id);
    this.db
      .prepare('UPDATE events SET result=? WHERE id=?')
      .run(JSON.stringify(result), pending.id);
    return result;
  }
  private ingestInside(battle: Battle, event: AudienceEvent, sourceFingerprint?: string): Receipt {
    // Profile enrichment is not an economic change. Preserve stable identity and payload semantics.
    const fingerprint = `v2:${sourceFingerprint ?? hash({ ...event, viewer: { id: event.viewer.id } })}`;
    const row = this.db
      .prepare('SELECT result,fingerprint FROM events WHERE id=?')
      .get(event.id) as { result: string; fingerprint: string | null } | undefined;
    if (row) {
      if (
        row.fingerprint &&
        row.fingerprint !== (row.fingerprint.startsWith('v2:') ? fingerprint : hash(event))
      )
        return {
          accepted: false,
          duplicate: true,
          reason: 'Event ID was already used for a different payload',
        };
      return { ...(JSON.parse(row.result) as EventResult), duplicate: true };
    }
    const result = this.apply(battle, event);
    this.db
      .prepare('INSERT INTO events(id,result,created,fingerprint) VALUES (?,?,?,?)')
      .run(event.id, JSON.stringify(result), Date.now(), fingerprint);
    this.flush(battle);
    return { ...result, duplicate: false };
  }
  ingest(battle: Battle, input: AudienceEvent): Receipt {
    const event = audienceEventSchema.parse(input);
    return this.atomic(battle, () => this.ingestInside(battle, event));
  }
  private rotate(battle: Battle) {
    const members = this.db
      .prepare('SELECT * FROM roster ORDER BY last_round ASC,rowid ASC')
      .all() as unknown as Member[];
    // Reserve half the active slots for each team, then fill any unused slots fairly.
    const selected = new Set<string>();
    for (const team of ['red', 'blue'])
      for (const m of members.filter((m) => m.team === team).slice(0, MAX_ACTIVE_VIEWERS / 2))
        selected.add(m.id);
    for (const m of members) {
      if (selected.size >= MAX_ACTIVE_VIEWERS) break;
      selected.add(m.id);
    }
    const players = members.filter((m) => selected.has(m.id));
    battle.replaceRoster(
      players.map((m) => ({ viewer: JSON.parse(m.body) as Viewer, team: m.team })),
    );
    for (const m of players)
      this.db.prepare('UPDATE roster SET last_round=? WHERE id=?').run(battle.state.round, m.id);
  }
  private flush(battle: Battle) {
    const pending = this.db
      .prepare(
        "SELECT id,body,team FROM gifts WHERE status='queued' AND (team IS NOT NULL OR json_extract(body,'$.gift')='thanks') ORDER BY created,rowid LIMIT 25",
      )
      .all() as unknown as Pending[];
    for (const p of pending) this.deliver(battle, p);
  }
  tick(battle: Battle, dt: number) {
    const round = battle.state.round;
    battle.update(dt);
    const hasPending = !!this.db
      .prepare(
        "SELECT 1 FROM gifts WHERE status='queued' AND (team IS NOT NULL OR json_extract(body,'$.gift')='thanks') LIMIT 1",
      )
      .get();
    if (
      round !== battle.state.round ||
      (hasPending && battle.state.phase === 'battle' && !battle.state.paused)
    )
      this.atomic(battle, () => {
        if (round !== battle.state.round) this.rotate(battle);
        this.flush(battle);
      });
  }
  restart(battle: Battle) {
    this.atomic(battle, () => {
      battle.restart();
      this.rotate(battle);
      this.flush(battle);
    });
  }
  resetLive(battle: Battle, roomId?: string) {
    this.atomic(battle, () => {
      this.db.exec(`DELETE FROM roster;
        UPDATE gifts SET result=json_set(result,'$.status','cosmetic','$.reason','Broadcast ended before delivery') WHERE status='queued';
        UPDATE events SET result=(SELECT result FROM gifts WHERE gifts.id=events.id) WHERE id IN (SELECT id FROM gifts WHERE status='queued');
        UPDATE gifts SET status='cosmetic' WHERE status='queued';`);
      battle.resetSession(roomId);
    });
  }
  diagnostics() {
    return {
      roster: this.db.prepare('SELECT team,COUNT(*) AS count FROM roster GROUP BY team').all(),
      gifts: this.db
        .prepare(
          "SELECT id,status,result,created,json_extract(body,'$.viewer.name') AS viewer,json_extract(body,'$.gift') AS gift,json_extract(body,'$.amount') AS amount FROM gifts ORDER BY created DESC,rowid DESC LIMIT 50",
        )
        .all()
        .map((row) => ({ ...row, result: JSON.parse(String(row.result)) as EventResult })),
      pending: (
        this.db.prepare("SELECT COUNT(*) AS count FROM gifts WHERE status='queued'").get() as {
          count: number;
        }
      ).count,
      catalog: this.db.prepare('SELECT * FROM gift_catalog ORDER BY name LIMIT 2000').all(),
    };
  }
  mapGift(id: string, action: TeamGift) {
    this.db
      .prepare(
        'INSERT INTO gift_catalog(id,name,action) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET action=excluded.action',
      )
      .run(id, id, action);
  }
  ingestLive(battle: Battle, input: LiveEvent, binding: LiveBinding): Receipt {
    const event = liveEventSchema.parse(input);
    if (event.type === 'gift' && !binding.creatorId)
      return {
        accepted: false,
        duplicate: false,
        reason: 'Set TIKTOK_CREATOR_ID to enable LIVE gift delivery',
      };
    if (
      event.roomId !== binding.roomId ||
      (event.type === 'gift' && event.recipientId !== binding.creatorId)
    )
      return {
        accepted: true,
        duplicate: false,
        status: 'cosmetic',
        reason: 'Filtered foreign room or gift recipient; no game effect',
      };
    return this.atomic(battle, () => {
      const scope = ['tiktok', event.roomId];
      if (event.type !== 'gift') {
        const { roomId: _room, ...action } = event;
        return this.ingestInside(battle, { ...action, id: `live:${hash([...scope, event.id])}` });
      }
      this.db
        .prepare(
          'INSERT INTO gift_catalog(id,name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',
        )
        .run(event.giftId, event.giftName);
      const mapping = this.db
        .prepare('SELECT action FROM gift_catalog WHERE id=?')
        .get(event.giftId) as { action: TeamGift };
      let count = event.count;
      let receiptId = `live:${hash([...scope, event.id])}`;
      if (event.streak && event.seriesId) {
        const series = hash([
          ...scope,
          event.viewer.id,
          event.recipientId,
          event.giftId,
          event.seriesId,
        ]);
        const previous = this.db.prepare('SELECT count FROM streaks WHERE id=?').get(series) as
          { count: number } | undefined;
        count = Math.max(0, event.count - (previous?.count ?? 0));
        if (!count)
          return { accepted: true, duplicate: true, reason: 'Streak count already processed' };
        this.db
          .prepare(
            'INSERT INTO streaks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count',
          )
          .run(series, event.count);
        receiptId = `live:${hash([series, event.count])}`;
      } else if (event.streak && !event.streakEnd) {
        return {
          accepted: true,
          duplicate: false,
          status: 'queued',
          reason: 'No stable streak ID; waiting for final message',
        };
      }
      return this.ingestInside(
        battle,
        {
          id: receiptId,
          type: 'gift',
          viewer: event.viewer,
          gift: mapping.action,
          amount: count,
        },
        hash({
          roomId: event.roomId,
          id: event.id,
          viewerId: event.viewer.id,
          recipientId: event.recipientId,
          giftId: event.giftId,
          count,
          streak: event.streak,
        }),
      );
    });
  }
  close() {
    this.db.close();
  }
}
