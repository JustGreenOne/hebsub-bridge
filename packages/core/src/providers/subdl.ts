import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import os from 'os';
import decompress from 'decompress';
import type {
  SubtitleProvider,
  SubtitleSearchInput,
  SubtitleSearchResult,
  DownloadedSubtitle,
  ProviderCapabilities,
} from '../types';
import { normalizeSubtitle } from '../normalizer';

const BASE_URL = 'https://api.subdl.com/api/v1';
const DOWNLOAD_BASE = 'https://dl.subdl.com';
const TIMEOUT_MS = 10_000;

interface SubDLItem {
  sd_id: number;
  lang: string;
  release_name?: string;
  season?: number;
  episode?: number;
  imdb_id?: string;
  downloads?: number;
  hi?: boolean;
  url: string;
}

export class SubDLProvider implements SubtitleProvider {
  readonly id = 'subdl';
  readonly displayName = 'SubDL';
  readonly capabilities: ProviderCapabilities = {
    supportsMovies: true,
    supportsSeries: true,
    supportsImdbId: true,
    supportsTmdbId: false,
    supportsHash: false,
    requiresApiKey: true,
    requiresLogin: false,
  };

  constructor(private readonly apiKey: string) {}

  async search(input: SubtitleSearchInput): Promise<SubtitleSearchResult[]> {
    if (!this.apiKey) return [];

    try {
      const params = new URLSearchParams({ languages: 'HE', api_key: this.apiKey });

      if (input.imdbId) params.set('imdb_id', input.imdbId.replace(/^tt/, ''));
      params.set('type', input.type === 'series' ? 'tv' : 'movie');
      if (input.season !== undefined) params.set('season_number', String(input.season));
      if (input.episode !== undefined) params.set('episode_number', String(input.episode));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(`${BASE_URL}/subtitles?${params}`, {
        signal: controller.signal as never,
      });
      clearTimeout(timer);

      if (!res.ok) return [];

      const data = (await res.json()) as { status: boolean; subtitles?: SubDLItem[] };
      if (!data.status || !data.subtitles) return [];

      return data.subtitles.map((item) => this.mapItem(item));
    } catch {
      return [];
    }
  }

  async download(result: SubtitleSearchResult, destDir: string): Promise<DownloadedSubtitle> {
    const raw = result.raw as SubDLItem;
    const url = raw.url.startsWith('http') ? raw.url : `${DOWNLOAD_BASE}${raw.url}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal as never });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`SubDL download failed: ${res.status}`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-subdl-'));
    const zipPath = path.join(tmpDir, `${result.subtitleId}.zip`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zipPath, buffer);

    const files = await decompress(zipPath, tmpDir);
    const srtFile = files.find((f) => f.path.endsWith('.srt') || f.path.endsWith('.vtt'));
    if (!srtFile) throw new Error('No SRT file found in SubDL archive');

    const originalPath = path.join(tmpDir, srtFile.path);
    const normalizedPath = path.join(destDir, `${result.subtitleId}.srt`);
    fs.mkdirSync(destDir, { recursive: true });
    await normalizeSubtitle(originalPath, normalizedPath);

    const cacheKey = `subdl:${result.subtitleId}`;
    return {
      providerId: this.id,
      subtitleId: result.subtitleId,
      originalPath,
      normalizedPath,
      format: 'srt',
      encoding: 'utf-8',
      cacheKey,
    };
  }

  private mapItem(item: SubDLItem): SubtitleSearchResult {
    return {
      providerId: this.id,
      providerName: this.displayName,
      subtitleId: String(item.sd_id),
      language: 'heb',
      title: item.release_name ?? '',
      releaseName: item.release_name,
      imdbId: item.imdb_id ? `tt${item.imdb_id}` : undefined,
      season: item.season,
      episode: item.episode,
      downloads: item.downloads,
      hearingImpaired: item.hi,
      format: 'srt',
      raw: item,
    };
  }
}
