import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type {
  SubtitleProvider,
  SubtitleSearchInput,
  SubtitleSearchResult,
  DownloadedSubtitle,
  ProviderCapabilities,
} from '../types';
import { normalizeSubtitle } from '../normalizer';

const BASE_URL = 'https://api.opensubtitles.com/api/v1';
const TIMEOUT_MS = 10_000;
const APP_NAME = 'HebSubBridge v0.1';

interface OSItem {
  id: string;
  attributes: {
    release?: string;
    language: string;
    season_number?: number;
    episode_number?: number;
    download_count?: number;
    hearing_impaired?: boolean;
    files: Array<{ file_id: number; file_name?: string }>;
    feature_details?: { imdb_id?: number };
  };
}

export class OpenSubtitlesProvider implements SubtitleProvider {
  readonly id = 'opensubtitles';
  readonly displayName = 'OpenSubtitles';
  readonly capabilities: ProviderCapabilities = {
    supportsMovies: true,
    supportsSeries: true,
    supportsImdbId: true,
    supportsTmdbId: false,
    supportsHash: true,
    requiresApiKey: true,
    requiresLogin: false,
  };

  private token: string | undefined;

  constructor(
    private readonly apiKey: string,
    private readonly username?: string,
    private readonly password?: string,
  ) {}

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Api-Key': this.apiKey,
      'User-Agent': APP_NAME,
    };

    if (this.username && this.password && !this.token) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(`${BASE_URL}/login`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: this.username, password: this.password }),
          signal: controller.signal as never,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json()) as { token?: string };
          if (data.token) this.token = data.token;
        }
      } catch {
        // ignore login errors — fall back to API key only
      }
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async search(input: SubtitleSearchInput): Promise<SubtitleSearchResult[]> {
    if (!this.apiKey) return [];

    try {
      const params = new URLSearchParams({ languages: 'he' });
      if (input.imdbId) params.set('imdb_id', input.imdbId.replace(/^tt/, ''));
      params.set('type', input.type === 'series' ? 'episode' : 'movie');
      if (input.season !== undefined) params.set('season_number', String(input.season));
      if (input.episode !== undefined) params.set('episode_number', String(input.episode));
      if (input.title) params.set('query', input.title);

      const headers = await this.getAuthHeaders();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(`${BASE_URL}/subtitles?${params}`, {
        headers,
        signal: controller.signal as never,
      });
      clearTimeout(timer);

      if (!res.ok) return [];

      const data = (await res.json()) as { data?: OSItem[] };
      return (data.data ?? []).map((item) => this.mapItem(item));
    } catch {
      return [];
    }
  }

  async download(result: SubtitleSearchResult, destDir: string): Promise<DownloadedSubtitle> {
    const raw = result.raw as OSItem;
    const fileId = raw.attributes.files[0]?.file_id;
    if (!fileId) throw new Error('No file_id in OpenSubtitles result');

    const headers = await this.getAuthHeaders();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const linkRes = await fetch(`${BASE_URL}/download`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
      signal: controller.signal as never,
    });
    clearTimeout(timer);

    if (!linkRes.ok) throw new Error(`OpenSubtitles link request failed: ${linkRes.status}`);
    const { link } = (await linkRes.json()) as { link: string };

    const dlController = new AbortController();
    const dlTimer = setTimeout(() => dlController.abort(), TIMEOUT_MS);
    const fileRes = await fetch(link, { signal: dlController.signal as never });
    clearTimeout(dlTimer);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-os-'));
    const originalPath = path.join(tmpDir, `${result.subtitleId}.srt`);
    fs.writeFileSync(originalPath, Buffer.from(await fileRes.arrayBuffer()));

    const normalizedPath = path.join(destDir, `${result.subtitleId}.srt`);
    fs.mkdirSync(destDir, { recursive: true });
    await normalizeSubtitle(originalPath, normalizedPath);

    return {
      providerId: this.id,
      subtitleId: result.subtitleId,
      originalPath,
      normalizedPath,
      format: 'srt',
      encoding: 'utf-8',
      cacheKey: `opensubtitles:${result.subtitleId}`,
    };
  }

  private mapItem(item: OSItem): SubtitleSearchResult {
    const a = item.attributes;
    const rawImdb = a.feature_details?.imdb_id;
    return {
      providerId: this.id,
      providerName: this.displayName,
      subtitleId: item.id,
      language: 'heb',
      title: a.release ?? '',
      releaseName: a.release,
      imdbId: rawImdb != null ? `tt${rawImdb}` : undefined,
      season: a.season_number,
      episode: a.episode_number,
      downloads: a.download_count,
      hearingImpaired: a.hearing_impaired,
      format: 'srt',
      raw: item,
    };
  }
}
