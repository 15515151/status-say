import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const app = createApp({
  baseUrl: process.env.BOT_API_BASE_URL || 'http://192.168.31.126:5332',
  apiKey: process.env.BOT_API_KEY,
  model: process.env.BOT_MODEL || 'xc',
  guoba: {
    baseUrl: process.env.GUOBA_BASE_URL,
    account: process.env.GUOBA_ACCOUNT,
    password: process.env.GUOBA_PASSWORD,
  },
});
const server = app.listen(port, host, () => console.log(`Xiangcai status is ready at http://${host}:${port}`));

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(error => process.exit(error ? 1 : 0));
  // Leave time for Docker's 30-second grace period while bounding stalled requests.
  setTimeout(() => process.exit(1), 25_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
