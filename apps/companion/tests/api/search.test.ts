import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/server';
import { defaultSettings } from '../../src/settings/store';
import { buildProviders } from '../../src/api/search';

vi.mock('@hebsub/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@hebsub/core')>();
  return {
    ...original,
    SubDLProvider: vi.fn().mockImplementation(() => ({
      id: 'subdl',
      displayName: 'SubDL',
      capabilities: {
        supportsMovies: true,
        supportsSeries: true,
        supportsImdbId: true,
        supportsTmdbId: false,
        supportsHash: false,
        requiresApiKey: true,
        requiresLogin: false,
      },
      search: vi.fn().mockResolvedValue([
        {
          providerId: 'subdl',
          providerName: 'SubDL',
          subtitleId: '99',
          language: 'heb',
          title: 'Breaking Bad',
          season: 1,
          episode: 2,
          imdbId: 'tt0903747',
          downloads: 5000,
        },
      ]),
      download: vi.fn(),
    })),
    OpenSubtitlesProvider: vi.fn().mockImplementation(() => ({
      id: 'opensubtitles',
      displayName: 'OpenSubtitles',
      capabilities: {},
      search: vi.fn().mockResolvedValue([]),
      download: vi.fn(),
    })),
    LocalFolderProvider: vi.fn().mockImplementation(() => ({
      id: 'local',
      displayName: 'Local',
      capabilities: {},
      search: vi.fn().mockResolvedValue([]),
      download: vi.fn(),
    })),
  };
});

describe('POST /search', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    app = await buildServer(defaultSettings());
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns ranked results and providersQueried on valid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: JSON.stringify({ type: 'series', language: 'heb', imdbId: 'tt0903747', season: 1, episode: 2 }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body).toHaveProperty('providersQueried');
    expect(body).toHaveProperty('cacheHit');
  });

  it('returns 400 when type field is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: JSON.stringify({ language: 'heb' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('does not include SubDL or OpenSubtitles when API keys are empty', async () => {
    const { SubDLProvider, OpenSubtitlesProvider, LocalFolderProvider } = await import('@hebsub/core');
    vi.mocked(SubDLProvider).mockClear();
    vi.mocked(OpenSubtitlesProvider).mockClear();
    vi.mocked(LocalFolderProvider).mockClear();

    const settings = defaultSettings(); // subdlApiKey: '', opensubtitlesApiKey: ''
    const providers = buildProviders(settings);

    expect(vi.mocked(SubDLProvider)).not.toHaveBeenCalled();
    expect(vi.mocked(OpenSubtitlesProvider)).not.toHaveBeenCalled();
    expect(vi.mocked(LocalFolderProvider)).toHaveBeenCalledOnce();
    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe('local');
  });

  it('includes SubDL when subdlApiKey is set', async () => {
    const { SubDLProvider } = await import('@hebsub/core');
    vi.mocked(SubDLProvider).mockClear();

    const settings = { ...defaultSettings(), subdlApiKey: 'test-api-key' };
    const providers = buildProviders(settings);

    expect(vi.mocked(SubDLProvider)).toHaveBeenCalledOnce();
    expect(vi.mocked(SubDLProvider)).toHaveBeenCalledWith('test-api-key');
    expect(providers.some((p) => p.id === 'subdl')).toBe(true);
  });
});
