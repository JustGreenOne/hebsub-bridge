import { FastifyInstance } from 'fastify';
import os from 'os';
import path from 'path';
import {
  HebSubEngine,
  HebSubSettings,
  SubtitleSearchInput,
} from '@hebsub/core';
import { addLog } from './logs.js';
import { buildProviders } from './search.js';
import { findVlc, launchVlc } from '../vlc/launcher.js';

// SECURITY: only allow safe, well-understood URL schemes.
// Reject javascript:, ftp:, magnet:, data:, etc.
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'file:'];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

interface PlayRequestBody {
  videoUrl: string;
  type: 'movie' | 'series';
  title?: string;
  imdbId?: string;
  tmdbId?: string;
  year?: number;
  season?: number;
  episode?: number;
  filename?: string;
}

export default async function playRoute(
  app: FastifyInstance,
  opts: { settings: HebSubSettings },
) {
  app.post<{ Body: PlayRequestBody }>('/play', {
    schema: {
      body: {
        type: 'object',
        required: ['videoUrl', 'type'],
        properties: {
          videoUrl: { type: 'string' },
          type: { type: 'string', enum: ['movie', 'series'] },
          title: { type: 'string' },
          imdbId: { type: 'string' },
          tmdbId: { type: 'string' },
          year: { type: 'number' },
          season: { type: 'number' },
          episode: { type: 'number' },
          filename: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { videoUrl, type, title, imdbId, tmdbId, year, season, episode, filename } = req.body;

    // SECURITY: validate URL protocol before doing anything else
    if (!isAllowedUrl(videoUrl)) {
      return reply.code(400).send({ error: 'Invalid or disallowed videoUrl protocol' });
    }

    const providers = buildProviders(opts.settings);
    const engine = new HebSubEngine();

    addLog(`[play] type=${type} imdbId=${imdbId ?? 'none'} season=${season ?? '-'} ep=${episode ?? '-'}`);

    const input: SubtitleSearchInput = {
      type,
      language: 'heb',
      title,
      imdbId,
      tmdbId,
      year,
      season,
      episode,
      filename,
    };

    const searchResult = await engine.search(input, providers);

    // No subtitle found — launch VLC without subtitles if possible
    if (searchResult.results.length === 0) {
      addLog('[play] no subtitles found');
      const vlcPath = await findVlc(opts.settings.vlcPath || undefined);
      if (!vlcPath) {
        return { success: false, noSubtitlesFound: true, error: 'No Hebrew subtitle found. VLC not found.' };
      }
      // SECURITY: empty subtitle path — VLC simply won't load any sub-file
      const vlcPid = await launchVlc(vlcPath, videoUrl, '');
      addLog(`[play] launched VLC without subtitle pid=${vlcPid}`);
      return { success: false, noSubtitlesFound: true, vlcPid, error: 'No Hebrew subtitle found. VLC launched without subtitles.' };
    }

    // Download the best-ranked subtitle
    const best = searchResult.results[0]!;
    const provider = providers.find((p) => p.id === best.providerId);
    if (!provider) {
      return { success: false, error: `Provider ${best.providerId} not available` };
    }

    const destDir = path.join(os.tmpdir(), 'hebsub', 'subtitles');
    const downloaded = await engine.download(best, provider, destDir);

    // Find and launch VLC
    const vlcPath = await findVlc(opts.settings.vlcPath || undefined);
    if (!vlcPath) {
      addLog('[play] VLC not found');
      return { success: false, subtitle: downloaded, error: 'VLC not found. Set vlcPath in settings.' };
    }

    // SECURITY: args passed as array to spawn — no shell interpolation
    const vlcPid = await launchVlc(vlcPath, videoUrl, downloaded.normalizedPath);
    addLog(`[play] launched VLC pid=${vlcPid} sub="${downloaded.normalizedPath}" score=${best.score}`);

    return { success: true, subtitle: downloaded, ranked: best, vlcPid };
  });
}
