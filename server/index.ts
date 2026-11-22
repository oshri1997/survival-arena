import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createBattleServer } from './app';
import { EulerConnector } from './live/euler';

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.TEAM_ADMIN_KEY || !process.env.TEAM_EVENT_KEY)
)
  throw new Error('Set TEAM_ADMIN_KEY and TEAM_EVENT_KEY before starting in production');

const adminKey = process.env.TEAM_ADMIN_KEY || randomBytes(18).toString('base64url');
const eventKey = process.env.TEAM_EVENT_KEY || randomBytes(24).toString('base64url');
const port = Number(process.env.PORT || 8787);
const username = process.env.TIKTOK_USERNAME?.trim();
const apiKey = process.env.EULER_API_KEY?.trim();
const creatorId = process.env.TIKTOK_CREATOR_ID?.trim();
if (Boolean(username) !== Boolean(apiKey) || (creatorId && !username))
  throw new Error(
    'Set TIKTOK_USERNAME and EULER_API_KEY together. TIKTOK_CREATOR_ID enables gifts.',
  );
const app = createBattleServer({
  adminKey,
  eventKey,
  statePath: process.env.TEAM_STATE_PATH || resolve('data/teams.sqlite'),
  distPath: resolve('dist'),
  demoJoin: process.env.TEAM_DEMO_JOIN !== 'false',
  seedDemo: process.env.TEAM_SEED_DEMO !== 'false',
  liveCollector: Boolean(username && apiKey),
});
const connector =
  username && apiKey
    ? new EulerConnector({
        username,
        apiKey,
        creatorId,
        accept: app.live.accept,
        bind: app.live.bind,
        status: app.live.status,
      })
    : undefined;
connector?.start();
app.server.listen(port, '0.0.0.0', () => {
  const actualPort = (app.server.address() as { port: number }).port;
  console.log(`Team Arena http://localhost:${actualPort}/teams.html`);
  console.log(`Admin http://localhost:${actualPort}/teams-admin.html`);
  if (!process.env.TEAM_ADMIN_KEY) console.log(`Generated admin key: ${adminKey}`);
  if (!process.env.TEAM_EVENT_KEY) console.log(`Generated event key: ${eventKey}`);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    connector?.stop();
    void app.close().then(() => process.exit(0));
  });
