import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildServer } from '../../src/server.js';
import { defaultSettings } from '../../src/settings/store.js';
import type { HebSubSettings } from '@hebsub/core';

vi.mock('@hebsub/core', async (importActual) => {
  const actual = await importActual<typeof import('@hebsub/core')>();
  return {
    ...actual,
    SubDLProvider: vi.fn().mockImplementation(() => ({
      id: 'subdl',
      displayName: 'SubDL',
      capabilities: { supportsMovies: true, supportsSeries: true },
      search: vi.fn().mockResolvedValue([]),
      download: vi.fn().mockResolvedValue({
        providerId: 'subdl',
        subtitleId: 'sub1',
        originalPath: '/tmp/a.srt',
        normalizedPath: '/tmp/a.utf8.srt',
        format: 'srt',
        encoding: 'utf-8',
        cacheKey: '',
      }),
    })),
    OpenSubtitlesProvider: vi.fn().mockImplementation(() => ({
      id: 'opensubtitles',
      displayName: 'OpenSubtitles',
      capabilities: { supportsMovies: true, supportsSeries: true },
      search: vi.fn().mockResolvedValue([]),
      download: vi.fn().mockResolvedValue({
        providerId: 'opensubtitles',
        subtitleId: 'sub2',
        originalPath: '/tmp/b.srt',
        normalizedPath: '/tmp/b.utf8.srt',
        format: 'srt',
        encoding: 'utf-8',
        cacheKey: '',
      }),
    })),
    LocalFolderProvider: vi.fn().mockImplementation(() => ({
      id: 'local',
      displayName: 'Local Folder',
      capabilities: { supportsMovies: true, supportsSeries: true },
      search: vi.fn().mockResolvedValue([]),
      download: vi.fn().mockResolvedValue({
        providerId: 'local',
        subtitleId: '/subs/movie.srt',
        originalPath: '/subs/movie.srt',
        normalizedPath: '/tmp/movie.utf8.srt',
        format: 'srt',
        encoding: 'utf-8',
        cacheKey: '',
      }),
    })),
    HebSubEngine: vi.fn().mockImplementation(() => ({
      search: vi.fn().mockResolvedValue({ results: [], providersQueried: [], cacheHit: false }),
      download: vi.fn(),
      findSubtitle: vi.fn().mockResolvedValue(null),
    })),
  };
});

const settingsWithSubdl: HebSubSettings = {
  ...defaultSettings,
  subdlApiKey: 'test-key',
  preferredProviders: ['subdl', 'local'],
};

describe('POST /download', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with normalizedPath on valid request', async () => {
    const app = await buildServer(settingsWithSubdl);
    const res = await app.inject({
      method: 'POST',
      url: '/download',
      payload: { providerId: 'subdl', subtitleId: 'sub1', type: 'movie' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.normalizedPath).toBe('/tmp/a.utf8.srt');
    expect(body.format).toBe('srt');
  });

  it('returns 400 when subtitleId is missing', async () => {
    const app = await buildServer(settingsWithSubdl);
    const res = await app.inject({
      method: 'POST',
      url: '/download',
      payload: { providerId: 'subdl', type: 'movie' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when provider is unknown or not configured', async () => {
    const app = await buildServer({ ...defaultSettings, preferredProviders: ['local'] });
    const res = await app.inject({
      method: 'POST',
      url: '/download',
      payload: { providerId: 'subdl', subtitleId: 'sub1', type: 'movie' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('subdl');
  });
});
