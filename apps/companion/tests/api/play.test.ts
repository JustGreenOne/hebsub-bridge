import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/server';
import { defaultSettings } from '../../src/settings/store';

// Mock the VLC launcher module — paths resolved relative to this test file
vi.mock('../../src/vlc/launcher', () => ({
  findVlc: vi.fn().mockResolvedValue('/usr/bin/vlc'),
  launchVlc: vi.fn().mockResolvedValue(9999),
}));

// Mock @hebsub/core — spread original so non-class exports (types, utils) pass through
vi.mock('@hebsub/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@hebsub/core')>();
  return {
    ...original,
    HebSubEngine: vi.fn().mockImplementation(() => ({
      search: vi.fn().mockResolvedValue({
        results: [
          {
            providerId: 'subdl',
            providerName: 'SubDL',
            subtitleId: '1',
            language: 'heb',
            title: 'Test Movie',
            score: 150,
            reasons: ['exact imdbId match'],
            warnings: [],
          },
        ],
        providersQueried: ['subdl'],
        cacheHit: false,
        searchInput: {},
      }),
      download: vi.fn().mockResolvedValue({
        providerId: 'subdl',
        subtitleId: '1',
        originalPath: '/tmp/1.srt',
        normalizedPath: '/tmp/1.srt',
        format: 'srt',
        encoding: 'utf-8',
        cacheKey: 'movie:tt0123456:heb',
      }),
    })),
    SubDLProvider: vi.fn().mockImplementation(() => ({
      id: 'subdl',
      search: vi.fn(),
      download: vi.fn(),
    })),
    OpenSubtitlesProvider: vi.fn().mockImplementation(() => ({
      id: 'opensubtitles',
      search: vi.fn(),
      download: vi.fn(),
    })),
    LocalFolderProvider: vi.fn().mockImplementation(() => ({
      id: 'local',
      search: vi.fn(),
      download: vi.fn(),
    })),
  };
});

describe('POST /play', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    app = await buildServer({ ...defaultSettings(), subdlApiKey: 'test-key' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns success with vlcPid when subtitle found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/play',
      payload: JSON.stringify({
        videoUrl: 'https://example.com/video.mkv',
        type: 'movie',
        imdbId: 'tt0123456',
        title: 'Test Movie',
        year: 2020,
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.vlcPid).toBe(9999);
  });

  it('returns 400 for missing videoUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/play',
      payload: JSON.stringify({ type: 'movie' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for disallowed videoUrl protocol', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/play',
      payload: JSON.stringify({ videoUrl: 'javascript:alert(1)', type: 'movie' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('launches VLC without subtitle when no subtitle is found', async () => {
    const { HebSubEngine } = await import('@hebsub/core');
    const { launchVlc } = await import('../../src/vlc/launcher');

    vi.mocked(HebSubEngine).mockImplementationOnce(() => ({
      search: vi.fn().mockResolvedValue({
        results: [],
        providersQueried: ['subdl'],
        cacheHit: false,
        searchInput: {},
      }),
      download: vi.fn(),
    }));
    vi.mocked(launchVlc).mockClear();

    const res = await app.inject({
      method: 'POST',
      url: '/play',
      payload: JSON.stringify({
        videoUrl: 'https://example.com/video.mkv',
        type: 'movie',
        title: 'Unknown Movie',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.noSubtitlesFound).toBe(true);
    // VLC must still have been launched
    expect(vi.mocked(launchVlc)).toHaveBeenCalledOnce();
  });

  it('returns error when VLC is not found', async () => {
    const { findVlc } = await import('../../src/vlc/launcher');
    vi.mocked(findVlc).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/play',
      payload: JSON.stringify({
        videoUrl: 'https://example.com/video.mkv',
        type: 'movie',
        imdbId: 'tt0123456',
        title: 'Test Movie',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/VLC not found/i);
  });
});
