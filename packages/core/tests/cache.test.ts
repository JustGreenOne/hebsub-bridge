import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheStore, buildCacheKey } from '../src/cache';
import { SubtitleSearchInput, DownloadedSubtitle } from '../src/types';
import os from 'os';
import path from 'path';
import fs from 'fs';

let tmpDir: string;
let store: CacheStore;
let sub: DownloadedSubtitle;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-cache-'));
  store = new CacheStore(tmpDir, 180);
  const normalizedPath = path.join(tmpDir, 'a.utf8.srt');
  fs.writeFileSync(normalizedPath, '1\n00:00:01,000 --> 00:00:02,000\nTest\n', 'utf8');
  sub = {
    providerId: 'subdl', subtitleId: '123', originalPath: path.join(tmpDir, 'a.srt'),
    normalizedPath, format: 'srt', encoding: 'utf-8', cacheKey: '',
  };
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

describe('buildCacheKey', () => {
  it('builds movie key', () => {
    const input: SubtitleSearchInput = { type: 'movie', language: 'heb', imdbId: 'tt1234567', year: 2020 };
    const key = buildCacheKey(input);
    expect(key).toContain('movie');
    expect(key).toContain('tt1234567');
  });

  it('builds series key with season/episode', () => {
    const input: SubtitleSearchInput = { type: 'series', language: 'heb', imdbId: 'tt0903747', season: 1, episode: 2 };
    const key = buildCacheKey(input);
    expect(key).toContain('series');
    expect(key).toContain('S01E02');
  });
});

describe('CacheStore', () => {
  it('returns null for missing key', () => {
    expect(store.get('nonexistent')).toBeNull();
  });

  it('stores and retrieves a subtitle', () => {
    store.set('mykey', sub);
    const result = store.get('mykey');
    expect(result?.subtitleId).toBe('123');
  });

  it('returns null for expired entry', () => {
    const expiredStore = new CacheStore(tmpDir, 0); // 0 days TTL
    expiredStore.set('k', sub);
    expect(expiredStore.get('k')).toBeNull();
  });
});
