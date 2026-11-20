import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createBattleServer } from './app';

const adminKey = process.env.TEAM_ADMIN_KEY || randomBytes(18).toString('base64url');
const eventKey = process.env.TEAM_EVENT_KEY || randomBytes(24).toString('base64url');
const port = Number(process.env.PORT || 8787);
const app = createBattleServer({
  adminKey,
  eventKey,
  statePath: process.env.TEAM_STATE_PATH || resolve('data/teams.sqlite'),
  distPath: resolve('dist'),
  demoJoin: process.env.TEAM_DEMO_JOIN !== 'false',
  seedDemo: process.env.TEAM_SEED_DEMO !== 'false',
});
app.server.listen(port, '0.0.0.0', () => {
  console.log(`Team Arena http://localhost:${port}/teams.html`);
  console.log(`Admin http://localhost:${port}/teams-admin.html`);
  if (!process.env.TEAM_ADMIN_KEY) console.log(`Generated admin key: ${adminKey}`);
  if (!process.env.TEAM_EVENT_KEY) console.log(`Generated event key: ${eventKey}`);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
