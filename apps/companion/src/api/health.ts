import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const version = (() => {
  try {
    return JSON.parse(
      readFileSync(path.join(__dirname, '../../package.json'), 'utf8'),
    ).version as string;
  } catch {
    return '0.1.0';
  }
})();

export default async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    version,
    uptime: Math.floor(process.uptime()),
  }));
}
