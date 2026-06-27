import { buildServer } from './server.js';
import { loadSettings } from './settings/store.js';

async function main(): Promise<void> {
  const settings = loadSettings();
  const app = await buildServer(settings);
  await app.listen({ port: 47583, host: '127.0.0.1' });
  console.warn('HebSub Companion running on http://127.0.0.1:47583');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
