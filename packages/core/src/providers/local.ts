import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  SubtitleProvider,
  SubtitleSearchInput,
  SubtitleSearchResult,
  DownloadedSubtitle,
  ProviderCapabilities,
  SubtitleFormat,
} from '../types';
import { parseFilename } from '../parser';
import { normalizeSubtitle } from '../normalizer';

const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.sub', '.ass', '.ssa']);

function scanDir(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanDir(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUBTITLE_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // unreadable directory — skip
  }
  return results;
}

function extToFormat(ext: string): SubtitleFormat {
  switch (ext.toLowerCase()) {
    case '.srt': return 'srt';
    case '.vtt': return 'vtt';
    case '.ass': return 'ass';
    case '.ssa': return 'ssa';
    case '.sub': return 'sub';
    default: return 'unknown';
  }
}

export class LocalFolderProvider implements SubtitleProvider {
  readonly id = 'local';
  readonly displayName = 'Local Folder';
  readonly capabilities: ProviderCapabilities = {
    supportsMovies: true,
    supportsSeries: true,
    supportsImdbId: false,
    supportsTmdbId: false,
    supportsHash: false,
    requiresApiKey: false,
    requiresLogin: false,
  };

  constructor(private readonly folders: string[]) {}

  async search(_input: SubtitleSearchInput): Promise<SubtitleSearchResult[]> {
    if (this.folders.length === 0) return [];

    const results: SubtitleSearchResult[] = [];
    for (const folder of this.folders) {
      const files = scanDir(folder);
      for (const filePath of files) {
        const filename = path.basename(filePath);
        const parsed = parseFilename(filename);
        const ext = path.extname(filename);
        results.push({
          providerId: this.id,
          providerName: this.displayName,
          subtitleId: filePath,
          language: 'heb',
          title: parsed.title ?? filename,
          releaseName: parsed.releaseName,
          season: parsed.season,
          episode: parsed.episode,
          year: parsed.year,
          format: extToFormat(ext),
          raw: { filePath },
        });
      }
    }
    return results;
  }

  async download(result: SubtitleSearchResult): Promise<DownloadedSubtitle> {
    const originalPath = result.subtitleId;
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-local-'));
    const normalizedPath = path.join(destDir, path.basename(originalPath));
    await normalizeSubtitle(originalPath, normalizedPath);
    return {
      providerId: this.id,
      subtitleId: result.subtitleId,
      originalPath,
      normalizedPath,
      format: 'srt',
      encoding: 'utf-8',
      cacheKey: `local:${originalPath}`,
    };
  }
}
