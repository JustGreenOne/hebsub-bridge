import Fastify, { FastifyInstance } from 'fastify';
import type { HebSubSettings } from '@hebsub/core';

/**
 * Build and configure the Fastify app instance.
 * Does NOT call listen() — callers are responsible for binding.
 * Binds on 127.0.0.1:47583 when started via index.ts.
 */
export async function buildServer(settings: HebSubSettings): Promise<FastifyInstance> {
  const app = Fastify({
    logger: settings.logLevel === 'debug',
    trustProxy: false,
  });

  // SECURITY: reject any request that did not originate from localhost.
  // We inspect X-Forwarded-For first (present during inject() tests and some
  // reverse-proxy setups), then fall back to the raw socket address.
  app.addHook('onRequest', async (req, reply) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded ?? req.socket.remoteAddress ?? '');

    const isLocalhost =
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '' ||
      ip.startsWith('::ffff:127.');

    if (!isLocalhost) {
      return reply
        .code(403)
        .send({ error: 'Forbidden: companion accepts localhost requests only' });
    }
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', version: '0.1.0' }));

  // Settings read-only endpoint
  app.get('/settings', async () => settings);

  // Stub for /play — full implementation in a later task
  app.post('/play', async (_req, reply) => {
    return reply.code(501).send({ error: 'Not implemented' });
  });

  return app;
}
