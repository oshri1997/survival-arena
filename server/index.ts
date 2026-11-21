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
const liveConfig = [
  process.env.TIKTOK_USERNAME,
  process.env.EULER_API_KEY,
  process.env.TIKTOK_CREATOR_ID,
];
if (liveConfig.some(Boolean) && !liveConfig.every(Boolean))
  throw new Error(
    'Set TIKTOK_USERNAME, EULER_API_KEY and TIKTOK_CREATOR_ID together, or leave all unset',
  );
const app = createBattleServer({
  adminKey,
  eventKey,
  statePath: process.env.TEAM_STATE_PATH || resolve('data/teams.sqlite'),
  distPath: resolve('dist'),
  demoJoin: process.env.TEAM_DEMO_JOIN !== 'false',
  seedDemo: process.env.TEAM_SEED_DEMO !== 'false',
});
const connector = liveConfig.every(Boolean)
  ? new EulerConnector({
      username: process.env.TIKTOK_USERNAME!,
      apiKey: process.env.EULER_API_KEY!,
      creatorId: process.env.TIKTOK_CREATOR_ID!,
      accept: app.live.accept,
      bind: app.live.bind,
      status: (status) => app.live.status({ ...status }),
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
