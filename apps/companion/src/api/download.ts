import { FastifyInstance } from 'fastify';
import type { HebSubSettings, SubtitleSearchResult } from '@hebsub/core';
import { buildProviders } from './search.js';
import { addLog } from './logs.js';

interface DownloadBody {
  providerId: string;
  subtitleId: string;
  type: 'movie' | 'series';
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  year?: number;
}

export default async function downloadRoute(
  app: FastifyInstance,
  opts: { settings: HebSubSettings },
) {
  app.post<{ Body: DownloadBody }>('/download', {
    schema: {
      body: {
        type: 'object',
        required: ['providerId', 'subtitleId', 'type'],
        properties: {
          providerId: { type: 'string' },
          subtitleId: { type: 'string' },
          type: { type: 'string', enum: ['movie', 'series'] },
          imdbId: { type: 'string' },
          tmdbId: { type: 'string' },
          season: { type: 'number' },
          episode: { type: 'number' },
          year: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    const { providerId, subtitleId, type, imdbId, tmdbId, season, episode, year } = req.body;

    const providers = buildProviders(opts.settings);
    const provider = providers.find((p) => p.id === providerId);

    if (!provider) {
      return reply.code(404).send({ error: `Provider '${providerId}' not found or not configured` });
    }

    const stub: SubtitleSearchResult = {
      providerId,
      providerName: providerId,
      subtitleId,
      language: 'heb',
      title: '',
      imdbId,
      tmdbId,
      season,
      episode,
      year,
    };

    try {
      addLog(`[download] provider=${providerId} subtitleId=${subtitleId}`);
      const downloaded = await provider.download(stub);
      return reply.send({ ok: true, normalizedPath: downloaded.normalizedPath, format: downloaded.format });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`[download] error: ${msg}`);
      return reply.code(500).send({ ok: false, error: msg });
    }
  });
}
