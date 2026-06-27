import { FastifyInstance } from 'fastify';
import type { HebSubSettings } from '@hebsub/core';
import { loadSettings, saveSettings } from '../settings/store.js';

export default async function settingsRoute(app: FastifyInstance) {
  // GET /settings — never expose API keys to callers
  app.get('/settings', async (_req, reply) => {
    const settings = loadSettings();
    const { subdlApiKey: _a, opensubtitlesApiKey: _b, ...safe } = settings;
    return reply.send(safe);
  });

  // POST /settings — merge partial update into persisted settings
  app.post<{ Body: Partial<HebSubSettings> }>('/settings', {
    schema: { body: { type: 'object' } },
  }, async (req, reply) => {
    const current = loadSettings();
    const updated = { ...current, ...req.body };
    saveSettings(updated);
    return reply.code(200).send({ ok: true });
  });
}
