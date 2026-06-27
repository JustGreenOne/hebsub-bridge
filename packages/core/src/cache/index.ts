import fs from 'fs';
import path from 'path';
import os from 'os';
import { SubtitleSearchInput, DownloadedSubtitle } from '../types';

export function buildCacheKey(input: SubtitleSearchInput): string {
  if (input.type === 'series' && input.season !== undefined && input.episode !== undefined) {
    const id = input.imdbId || input.tmdbId || 'unknown';
    const ep = `S${String(input.season).padStart(2, '0')}E${String(input.episode).padStart(2, '0')}`;
    return `series:${id}:${ep}`;
  }
  const id = input.imdbId || input.tmdbId || 'unknown';
  const year = input.year ?? 'unknown';
  return `movie:${id}:${year}`;
}

interface CacheEntry {
  subtitle: DownloadedSubtitle;
  storedAt: number;
}

export class CacheStore {
  readonly cacheDir: string;
  private readonly ttlMs: number;

  constructor(cacheDir?: string, ttlDays = 180) {
    const defaultDir = process.platform === 'win32'
      ? path.join(process.env['APPDATA'] || os.homedir(), 'HebSubBridge', 'cache', 'subtitles')
      : path.join(os.homedir(), '.hebsub', 'cache', 'subtitles');
    this.cacheDir = cacheDir ?? defaultDir;
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  private metaPath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9:_-]/g, '_');
    return path.join(this.cacheDir, `${safe}.meta.json`);
  }

  get(key: string): DownloadedSubtitle | null {
    const mp = this.metaPath(key);
    if (!fs.existsSync(mp)) return null;
    try {
      const entry: CacheEntry = JSON.parse(fs.readFileSync(mp, 'utf8'));
      if (this.ttlMs === 0 || Date.now() - entry.storedAt > this.ttlMs) return null;
      if (!fs.existsSync(entry.subtitle.normalizedPath)) return null;
      return entry.subtitle;
    } catch {
      return null;
    }
  }

  set(key: string, subtitle: DownloadedSubtitle): void {
    const entry: CacheEntry = { subtitle, storedAt: Date.now() };
    fs.writeFileSync(this.metaPath(key), JSON.stringify(entry, null, 2), 'utf8');
  }
}
