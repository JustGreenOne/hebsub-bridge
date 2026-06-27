export type MediaType = 'movie' | 'series';
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'sub' | 'unknown';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ProviderCapabilities {
  supportsMovies: boolean;
  supportsSeries: boolean;
  supportsImdbId: boolean;
  supportsTmdbId: boolean;
  supportsHash: boolean;
  requiresApiKey: boolean;
  requiresLogin: boolean;
}

export interface SubtitleSearchInput {
  type: MediaType;
  language: 'heb';
  title?: string;
  originalTitle?: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  filename?: string;
  releaseName?: string;
  videoHash?: string;
  videoSize?: number;
  preferredProviders?: string[];
  allowHearingImpaired?: boolean;
}

export interface SubtitleSearchResult {
  providerId: string;
  providerName: string;
  subtitleId: string;
  language: 'heb';
  title: string;
  releaseName?: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  downloads?: number;
  rating?: number;
  hearingImpaired?: boolean;
  format?: SubtitleFormat;
  raw?: unknown;
}

export interface DownloadedSubtitle {
  providerId: string;
  subtitleId: string;
  originalPath: string;
  normalizedPath: string;
  format: 'srt' | 'vtt';
  encoding: 'utf-8';
  cacheKey: string;
}

export interface RankedSubtitle extends SubtitleSearchResult {
  score: number;
  reasons: string[];
  warnings: string[];
}

export interface SubtitleProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  search(input: SubtitleSearchInput): Promise<SubtitleSearchResult[]>;
  download(result: SubtitleSearchResult, destDir: string): Promise<DownloadedSubtitle>;
}

export interface ParsedFilename {
  title?: string;
  year?: number;
  season?: number;
  episode?: number;
  releaseName: string;
  resolution?: string;
  releaseGroup?: string;
}

export interface HebSubSettings {
  vlcPath: string;
  language: 'heb';
  preferredProviders: string[];
  allowHearingImpaired: boolean;
  autoLaunchVlc: boolean;
  cacheEnabled: boolean;
  cacheTtlDays: number;
  subdlApiKey: string;
  opensubtitlesApiKey: string;
  localSubtitleFolders: string[];
  logLevel: LogLevel;
}

export interface PlayRequest {
  videoUrl: string;
  type: MediaType;
  title?: string;
  originalTitle?: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  filename?: string;
  releaseName?: string;
}

export interface PlayResult {
  success: boolean;
  subtitle?: DownloadedSubtitle;
  ranked?: RankedSubtitle;
  vlcPid?: number;
  error?: string;
  noSubtitlesFound?: boolean;
}

export interface SearchResult {
  results: RankedSubtitle[];
  searchInput: SubtitleSearchInput;
  providersQueried: string[];
  cacheHit: boolean;
}
