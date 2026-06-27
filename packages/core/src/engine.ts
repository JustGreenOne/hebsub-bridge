import {
  SubtitleProvider,
  SubtitleSearchInput,
  SubtitleSearchResult,
  DownloadedSubtitle,
  RankedSubtitle,
  SearchResult,
} from './types';
import { rankResults } from './ranker';
import { CacheStore, buildCacheKey } from './cache';

export class HebSubEngine {
  readonly cache: CacheStore;

  constructor(cacheDir?: string, private readonly cacheTtlDays = 180) {
    this.cache = new CacheStore(cacheDir, cacheTtlDays);
  }

  async search(
    input: SubtitleSearchInput,
    providers: SubtitleProvider[],
  ): Promise<SearchResult> {
    const cacheKey = buildCacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        results: [],
        searchInput: input,
        providersQueried: [],
        cacheHit: true,
      };
    }

    const settled = await Promise.allSettled(
      providers.map((p) => p.search(input)),
    );

    const flat: SubtitleSearchResult[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        flat.push(...outcome.value);
      }
    }

    const ranked: RankedSubtitle[] = rankResults(flat, input);

    return {
      results: ranked,
      searchInput: input,
      providersQueried: providers.map((p) => p.id),
      cacheHit: false,
    };
  }

  async download(
    result: RankedSubtitle,
    provider: SubtitleProvider,
  ): Promise<DownloadedSubtitle> {
    const downloaded = await provider.download(result);
    const cacheKey = buildCacheKey({
      type: result.season !== undefined ? 'series' : 'movie',
      language: 'heb',
      imdbId: result.imdbId,
      tmdbId: result.tmdbId,
      season: result.season,
      episode: result.episode,
      year: result.year,
    });
    this.cache.set(cacheKey, downloaded);
    return downloaded;
  }

  async findSubtitle(
    input: SubtitleSearchInput,
    providers: SubtitleProvider[],
  ): Promise<DownloadedSubtitle | null> {
    const cacheKey = buildCacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const searchResult = await this.search(input, providers);
    if (searchResult.results.length === 0) return null;

    const top = searchResult.results[0] as RankedSubtitle;
    const provider = providers.find((p) => p.id === top.providerId);
    if (!provider) return null;

    return this.download(top, provider);
  }
}
