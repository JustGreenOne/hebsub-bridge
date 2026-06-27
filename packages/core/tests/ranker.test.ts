import { describe, it, expect } from 'vitest';
import { rankResults } from '../src/ranker';
import { SubtitleSearchResult, SubtitleSearchInput } from '../src/types';

const base: SubtitleSearchResult = {
  providerId: 'test', providerName: 'Test', subtitleId: '1',
  language: 'heb', title: 'Breaking Bad',
};

const input: SubtitleSearchInput = {
  type: 'series', language: 'heb',
  imdbId: 'tt0903747', season: 1, episode: 2,
  title: 'Breaking Bad', year: 2008,
};

describe('rankResults', () => {
  it('returns empty array for empty input', () => {
    expect(rankResults([], input)).toEqual([]);
  });

  it('scores exact imdbId match +120', () => {
    const result = rankResults([{ ...base, imdbId: 'tt0903747' }], input);
    expect(result[0].score).toBeGreaterThanOrEqual(120);
    expect(result[0].reasons).toContain('exact imdbId match');
  });

  it('penalises wrong episode -100', () => {
    const wrong = { ...base, imdbId: 'tt0903747', season: 1, episode: 5 };
    const right = { ...base, imdbId: 'tt0903747', season: 1, episode: 2 };
    const ranked = rankResults([wrong, right], input);
    expect(ranked[0].subtitleId).toBe(right.subtitleId);
    const wrongRanked = ranked.find(r => r.episode === 5)!;
    expect(wrongRanked.score).toBeLessThan(ranked[0].score);
    expect(wrongRanked.warnings).toContain('wrong episode');
  });

  it('penalises hearing impaired when not requested -25', () => {
    // Use non-matching title so no positive signals, only HI penalty applies → score < 0
    const hi = { ...base, title: 'Something Else', hearingImpaired: true };
    const ranked = rankResults([hi], { ...input, allowHearingImpaired: false });
    expect(ranked[0].score).toBeLessThan(0);
    expect(ranked[0].warnings).toContain('hearing impaired not requested');
  });

  it('sorts highest score first', () => {
    const good = { ...base, subtitleId: 'good', imdbId: 'tt0903747', season: 1, episode: 2 };
    const bad = { ...base, subtitleId: 'bad', hearingImpaired: true };
    const ranked = rankResults([bad, good], input);
    expect(ranked[0].subtitleId).toBe('good');
  });

  it('penalises wrong imdbId -70', () => {
    const wrongId = { ...base, title: 'Something Else', imdbId: 'tt9999999' };
    const ranked = rankResults([wrongId], input);
    expect(ranked[0].score).toBeLessThan(0);
    expect(ranked[0].warnings).toContain('wrong imdbId');
  });

  it('includes reasons array in output', () => {
    const ranked = rankResults([{ ...base, imdbId: 'tt0903747' }], input);
    expect(Array.isArray(ranked[0].reasons)).toBe(true);
    expect(Array.isArray(ranked[0].warnings)).toBe(true);
  });
});
