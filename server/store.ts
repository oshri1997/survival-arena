import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BattleState, AudienceEvent } from '../src/teams/contracts';
import type { Battle, EventResult } from '../src/teams/Battle';

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, result TEXT NOT NULL, created INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS events_created ON events(created);',
    );
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
  ingest(battle: Battle, event: AudienceEvent): EventResult & { duplicate: boolean } {
    const row = this.db.prepare('SELECT result FROM events WHERE id=?').get(event.id) as
      { result: string } | undefined;
    if (row) return { ...(JSON.parse(row.result) as EventResult), duplicate: true };
    const before = structuredClone(battle.state);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = battle.apply(event);
      this.save(battle.state);
      this.db
        .prepare('INSERT INTO events VALUES (?,?,?)')
        .run(event.id, JSON.stringify(result), Date.now());
      this.db
        .prepare(
          'DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY created DESC LIMIT -1 OFFSET 20000)',
        )
        .run();
      this.db.exec('COMMIT');
      return { ...result, duplicate: false };
    } catch (error) {
      this.db.exec('ROLLBACK');
      battle.state = before;
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
