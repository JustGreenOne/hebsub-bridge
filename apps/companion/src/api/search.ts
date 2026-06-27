import { FastifyInstance } from 'fastify';
import {
  HebSubSettings,
  HebSubEngine,
  SubDLProvider,
  OpenSubtitlesProvider,
  LocalFolderProvider,
  SubtitleSearchInput,
  SubtitleProvider,
} from '@hebsub/core';
import { addLog } from './logs.js';

export default async function searchRoute(
  app: FastifyInstance,
  opts: { settings: HebSubSettings },
) {
  app.post<{ Body: SubtitleSearchInput }>('/search', {
    schema: {
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['movie', 'series'] },
          language: { type: 'string' },
          title: { type: 'string' },
          year: { type: 'number' },
          imdbId: { type: 'string' },
          tmdbId: { type: 'string' },
          season: { type: 'number' },
          episode: { type: 'number' },
          filename: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const input: SubtitleSearchInput = { ...req.body, language: 'heb' };
    const providers = buildProviders(opts.settings);
    const engine = new HebSubEngine();
    addLog(`[search] ${JSON.stringify({ type: input.type, imdbId: input.imdbId, season: input.season, episode: input.episode })}`);
    const result = await engine.search(input, providers);
    addLog(`[search] found ${result.results.length} results, cacheHit=${result.cacheHit}`);
    return reply.send(result);
  });
}

export function buildProviders(settings: HebSubSettings): SubtitleProvider[] {
  const providers: SubtitleProvider[] = [];
  for (const id of settings.preferredProviders) {
    if (id === 'subdl' && settings.subdlApiKey) {
      providers.push(new SubDLProvider(settings.subdlApiKey));
    }
    if (id === 'opensubtitles' && settings.opensubtitlesApiKey) {
      providers.push(new OpenSubtitlesProvider(settings.opensubtitlesApiKey));
    }
    if (id === 'local') {
      providers.push(new LocalFolderProvider(settings.localSubtitleFolders));
    }
  }
  return providers;
}
