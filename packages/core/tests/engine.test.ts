import { describe, it, expect, vi } from 'vitest';
import { HebSubEngine } from '../src/engine';
import { SubtitleProvider, SubtitleSearchInput, SubtitleSearchResult } from '../src/types';
import os from 'os';
import path from 'path';
import fs from 'fs';

function makeProvider(id: string, results: Partial<SubtitleSearchResult>[]): SubtitleProvider {
  return {
    id,
    displayName: id,
    capabilities: {
      supportsMovies: true,
      supportsSeries: true,
      supportsImdbId: true,
      supportsTmdbId: false,
      supportsHash: false,
      requiresApiKey: false,
      requiresLogin: false,
    },
    search: vi.fn().mockResolvedValue(
      results.map((r) => ({
        providerId: id,
        providerName: id,
        subtitleId: r.subtitleId ?? '1',
        language: 'heb' as const,
        title: r.title ?? 'Test',
        ...r,
      })),
    ),
    download: vi.fn(),
  };
}

describe('HebSubEngine', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-engine-'));

  it('returns ranked results from multiple providers', async () => {
    const p1 = makeProvider('a', [{ subtitleId: 'a1', imdbId: 'tt123' }]);
    const p2 = makeProvider('b', [{ subtitleId: 'b1', downloads: 9999 }]);
    const engine = new HebSubEngine(tmpDir);
    const input: SubtitleSearchInput = { type: 'movie', language: 'heb', imdbId: 'tt123' };
    const result = await engine.search(input, [p1, p2]);
    expect(result.results.length).toBe(2);
    expect(result.providersQueried).toEqual(['a', 'b']);
    expect(result.results[0].score).toBeGreaterThanOrEqual(result.results[1].score);
  });

  it('returns empty results when all providers return nothing', async () => {
    const p = makeProvider('empty', []);
    const engine = new HebSubEngine(tmpDir);
    const result = await engine.search({ type: 'movie', language: 'heb' }, [p]);
    expect(result.results).toEqual([]);
  });

  it('uses cache on second call with same key', async () => {
    const engine = new HebSubEngine(tmpDir);
    // populate cache manually
    const fakeSub = {
      providerId: 'test',
      subtitleId: '42',
      originalPath: '/tmp/x.srt',
      normalizedPath: '/tmp/x.srt',
      format: 'srt' as const,
      encoding: 'utf-8' as const,
      cacheKey: 'movie:tt9999:2020',
    };
    // write fake file so cache validation passes
    fs.writeFileSync('/tmp/x.srt', 'test');
    engine.cache.set('movie:tt9999:2020', fakeSub);
    const p = makeProvider('shouldnotcall', [{ subtitleId: 'xxx' }]);
    const result = await engine.search(
      { type: 'movie', language: 'heb', imdbId: 'tt9999', year: 2020 },
      [p],
    );
    expect(result.cacheHit).toBe(true);
    expect(p.search).not.toHaveBeenCalled();
  });
});
