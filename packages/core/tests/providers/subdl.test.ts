import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubDLProvider } from '../../src/providers/subdl';

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

import fetch from 'node-fetch';
const mockFetch = vi.mocked(fetch);

const mockSearchResponse = {
  status: true,
  subtitles: [
    {
      sd_id: 123456,
      lang: 'HE',
      release_name: 'Breaking.Bad.S01E02.1080p',
      season: 1,
      episode: 2,
      imdb_id: '0903747',
      downloads: 5000,
      hi: false,
      url: '/subtitles/breaking-bad-s01e02.zip',
    },
  ],
};

describe('SubDLProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct id and capabilities', () => {
    const p = new SubDLProvider('test-key');
    expect(p.id).toBe('subdl');
    expect(p.capabilities.supportsImdbId).toBe(true);
    expect(p.capabilities.supportsSeries).toBe(true);
  });

  it('searches and maps results correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResponse,
    } as never);

    const p = new SubDLProvider('test-key');
    const results = await p.search({
      type: 'series',
      language: 'heb',
      imdbId: 'tt0903747',
      season: 1,
      episode: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0].providerId).toBe('subdl');
    expect(results[0].subtitleId).toBe('123456');
    expect(results[0].imdbId).toBe('tt0903747');
    expect(results[0].season).toBe(1);
    expect(results[0].episode).toBe(2);
    expect(results[0].downloads).toBe(5000);
  });

  it('returns empty array when no API key', async () => {
    const p = new SubDLProvider('');
    const results = await p.search({ type: 'movie', language: 'heb', imdbId: 'tt1234567' });
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty array when API returns no subtitles', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, subtitles: [] }),
    } as never);
    const p = new SubDLProvider('test-key');
    const results = await p.search({ type: 'movie', language: 'heb', title: 'Unknown' });
    expect(results).toEqual([]);
  });

  it('returns empty array on network error (provider isolation)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    const p = new SubDLProvider('test-key');
    const results = await p.search({ type: 'movie', language: 'heb' });
    expect(results).toEqual([]);
  });
});
