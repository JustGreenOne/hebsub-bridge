import { describe, it, expect, vi } from 'vitest';

// Mock @hebsub/core before importing from src/index so the module-level
// imports in index.ts resolve without requiring the compiled core package.
vi.mock('@hebsub/core', () => ({
  HebSubEngine: vi.fn(),
  SubDLProvider: vi.fn(),
  OpenSubtitlesProvider: vi.fn(),
  LocalFolderProvider: vi.fn(),
}));

import { parseArgs, ParseArgsError } from '../src/index';

describe('parseArgs', () => {
  it('returns correct SubtitleSearchInput for a movie', () => {
    const result = parseArgs(['--imdb', 'tt0903747', '--type', 'movie', '--year', '2008']);

    expect(result.imdbId).toBe('tt0903747');
    expect(result.type).toBe('movie');
    expect(result.year).toBe(2008);
    expect(result.language).toBe('heb');
    expect(result.season).toBeUndefined();
    expect(result.episode).toBeUndefined();
  });

  it('returns correct SubtitleSearchInput for a series episode', () => {
    const result = parseArgs([
      '--imdb', 'tt0903747',
      '--type', 'series',
      '--season', '1',
      '--episode', '2',
    ]);

    expect(result.imdbId).toBe('tt0903747');
    expect(result.type).toBe('series');
    expect(result.season).toBe(1);
    expect(result.episode).toBe(2);
    expect(result.language).toBe('heb');
  });

  it('throws ParseArgsError with helpful message when --imdb is missing', () => {
    expect(() => parseArgs(['--type', 'movie'])).toThrow(ParseArgsError);
    expect(() => parseArgs(['--type', 'movie'])).toThrow('Missing required flag: --imdb');
  });
});
