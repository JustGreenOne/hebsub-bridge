import { FastifyInstance } from 'fastify';

const recentLogs: string[] = [];
const MAX_LOGS = 200;

/**
 * Append a log entry to the in-memory ring buffer.
 * NEVER pass strings that contain API keys, tokens, or signed URLs.
 */
export function addLog(msg: string): void {
  recentLogs.push(msg);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }
}

export default async function logsRoute(app: FastifyInstance) {
  app.get('/logs/recent', async () => ({
    logs: recentLogs.slice(-50),
  }));
}
