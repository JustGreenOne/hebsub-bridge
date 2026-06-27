import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenSubtitlesProvider } from '../../src/providers/opensubtitles';

vi.mock('node-fetch', () => ({ default: vi.fn() }));
import fetch from 'node-fetch';
const mockFetch = vi.mocked(fetch);

const mockSearchResponse = {
  data: [
    {
      id: '9876',
      attributes: {
        release: 'Breaking.Bad.S01E02.1080p',
        language: 'he',
        season_number: 1,
        episode_number: 2,
        download_count: 3000,
        hearing_impaired: false,
        files: [{ file_id: 111, file_name: 'sub.srt' }],
        feature_details: { imdb_id: 903747 },
      },
    },
  ],
  total_count: 1,
};

describe('OpenSubtitlesProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct id and capabilities', () => {
    const p = new OpenSubtitlesProvider('key');
    expect(p.id).toBe('opensubtitles');
    expect(p.capabilities.supportsImdbId).toBe(true);
    expect(p.capabilities.supportsSeries).toBe(true);
    expect(p.capabilities.requiresApiKey).toBe(true);
  });

  it('maps results with correct fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse } as never);
    const p = new OpenSubtitlesProvider('key');
    const results = await p.search({
      type: 'series',
      language: 'heb',
      imdbId: 'tt0903747',
      season: 1,
      episode: 2,
    });
    expect(results).toHaveLength(1);
    expect(results[0].subtitleId).toBe('9876');
    expect(results[0].providerId).toBe('opensubtitles');
    expect(results[0].imdbId).toBe('tt903747');
    expect(results[0].season).toBe(1);
    expect(results[0].episode).toBe(2);
    expect(results[0].downloads).toBe(3000);
    expect(results[0].hearingImpaired).toBe(false);
    expect(results[0].releaseName).toBe('Breaking.Bad.S01E02.1080p');
  });

  it('returns empty array on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    const results = await new OpenSubtitlesProvider('key').search({
      type: 'movie',
      language: 'heb',
    });
    expect(results).toEqual([]);
  });

  it('returns empty array when no API key provided', async () => {
    const p = new OpenSubtitlesProvider('');
    const results = await p.search({ type: 'movie', language: 'heb', imdbId: 'tt1234567' });
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty array when API response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 } as never);
    const results = await new OpenSubtitlesProvider('key').search({
      type: 'movie',
      language: 'heb',
    });
    expect(results).toEqual([]);
  });
});
