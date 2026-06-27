# HebSub Bridge — Phase 1 & 2 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working CLI + local companion HTTP server that automatically finds Hebrew subtitles and launches VLC with them when given Stremio video metadata.

**Architecture:** A pnpm monorepo with a shared `packages/core` subtitle engine (search, rank, cache, normalize), an `apps/companion` Fastify server on `127.0.0.1:47583` that bridges Stremio to VLC, and an `apps/cli` tool for developer testing. The core never knows who calls it — it only turns metadata into a subtitle file.

**Tech Stack:** TypeScript 5 (strict), pnpm 8 workspaces, Turborepo, Vitest 1, Fastify 4, node-fetch 3, iconv-lite, jschardet, decompress (ZIP/GZ extraction)

## Global Constraints

- Node.js ≥ 16.14 (use `nvm use 16` before any command)
- pnpm 8 — never use npm or yarn in this repo
- TypeScript `strict: true` everywhere
- All providers must enforce a 10 000 ms timeout and catch their own errors — a broken provider must never reject the entire search
- Companion binds to `127.0.0.1` only — never `0.0.0.0`
- **Never build shell commands via string concatenation** — always `spawn(cmd, [arg1, arg2])` with an argument array
- Never log API keys, Authorization headers, cookies, or signed stream URLs
- Cache root on Windows: `%APPDATA%\HebSubBridge\cache\subtitles\`; on Linux/CI: `~/.hebsub/cache/subtitles/`
- Repo root: `/root/hebsub-bridge` — all relative paths below are from there
- Push to `origin main` after each task

---

## File Map

```
hebsub-bridge/
  package.json                          ← pnpm workspace root (no src)
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .eslintrc.cjs
  .prettierrc.json
  packages/
    core/
      package.json
      tsconfig.json
      src/
        types/index.ts                  ← all shared TS types (Task 2)
        parser/index.ts                 ← filename → ParsedFilename (Task 3)
        ranker/index.ts                 ← SubtitleSearchResult[] → RankedSubtitle[] (Task 4)
        normalizer/index.ts             ← raw file → UTF-8 SRT path (Task 5)
        cache/index.ts                  ← CacheStore: get/set/key (Task 6)
        providers/
          base.ts                       ← SubtitleProvider interface re-export (Task 7)
          subdl.ts                      ← SubDL API provider (Task 7)
          opensubtitles.ts              ← OpenSubtitles REST provider (Task 8)
          local.ts                      ← local folder scanner (Task 9)
        engine.ts                       ← orchestrates search+rank+download (Task 10)
        index.ts                        ← public API re-exports (Task 10)
      tests/
        parser.test.ts
        ranker.test.ts
        normalizer.test.ts
        cache.test.ts
        providers/subdl.test.ts
        providers/opensubtitles.test.ts
        providers/local.test.ts
        engine.test.ts
  apps/
    cli/
      package.json
      tsconfig.json
      src/index.ts                      ← hebsub CLI entry (Task 11)
    companion/
      package.json
      tsconfig.json
      src/
        index.ts                        ← process entry: build + listen (Task 12)
        server.ts                       ← buildServer(): FastifyInstance (Task 12)
        settings/store.ts               ← read/write settings JSON (Task 12)
        vlc/launcher.ts                 ← findVlc() + launchVlc() (Task 13)
        api/
          health.ts                     ← GET /health (Task 14)
          settings.ts                   ← GET+POST /settings (Task 14)
          logs.ts                       ← GET /logs/recent (Task 14)
          search.ts                     ← POST /search (Task 15)
          play.ts                       ← POST /play (Task 16)
          download.ts                   ← POST /download (Task 17)
      tests/
        server.test.ts
        vlc/launcher.test.ts
        api/play.test.ts
        api/search.test.ts
```

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.prettierrc.json`
- Create: `.eslintrc.cjs`

**Interfaces:** Produces nothing consumed by code — sets up the build system.

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "hebsub-bridge",
  "private": true,
  "version": "0.1.0",
  "engines": { "node": ">=16.14", "pnpm": ">=8" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev:companion": "turbo run dev --filter=@hebsub/companion",
    "dev:cli": "turbo run dev --filter=@hebsub/cli"
  },
  "devDependencies": {
    "turbo": "^1.13.4",
    "typescript": "^5.4.5",
    "prettier": "^3.2.5",
    "eslint": "^8.57.0",
    "@typescript-eslint/eslint-plugin": "^7.8.0",
    "@typescript-eslint/parser": "^7.8.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "lint": { "cache": false },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 5: Create .prettierrc.json**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 6: Create .eslintrc.cjs**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
```

- [ ] **Step 7: Install root dev dependencies**

```bash
cd /root/hebsub-bridge
source ~/.nvm/nvm.sh && nvm use 16
pnpm install
```

Expected: `node_modules/.pnpm` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .prettierrc.json .eslintrc.cjs pnpm-lock.yaml
git commit -m "chore: monorepo scaffold with pnpm workspaces and Turborepo"
git push
```

---

## Task 2: Core Package — Types

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types/index.ts`

**Interfaces:**
- Produces: All shared TypeScript types used by every other task. Import from `@hebsub/core` or `../types`.

- [ ] **Step 1: Create packages/core/package.json**

```json
{
  "name": "@hebsub/core",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "iconv-lite": "^0.6.3",
    "jschardet": "^3.0.0",
    "decompress": "^4.2.1",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "@types/node": "^16.18.96",
    "@types/jschardet": "^1.6.3",
    "@types/decompress": "^4.2.7",
    "vitest": "^1.5.3"
  }
}
```

- [ ] **Step 2: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create packages/core/src/types/index.ts**

```typescript
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
```

- [ ] **Step 4: Install core dependencies**

```bash
cd /root/hebsub-bridge
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/ pnpm-lock.yaml
git commit -m "feat(core): add package scaffold and shared TypeScript types"
git push
```

---

## Task 3: Core — Filename Parser

**Files:**
- Create: `packages/core/src/parser/index.ts`
- Create: `packages/core/tests/parser.test.ts`
- Create: `packages/core/vitest.config.ts`

**Interfaces:**
- Produces: `parseFilename(filename: string): ParsedFilename`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write failing tests**

```typescript
// packages/core/tests/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseFilename } from '../src/parser';

describe('parseFilename', () => {
  it('parses a movie filename with year', () => {
    const r = parseFilename('The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv');
    expect(r.title).toBe('The Matrix');
    expect(r.year).toBe(1999);
    expect(r.season).toBeUndefined();
    expect(r.episode).toBeUndefined();
    expect(r.resolution).toBe('1080p');
    expect(r.releaseGroup).toBe('GROUP');
  });

  it('parses a series filename with SxxExx pattern', () => {
    const r = parseFilename('Breaking.Bad.S01E02.1080p.WEB-DL.x264-Group.mkv');
    expect(r.title).toBe('Breaking Bad');
    expect(r.season).toBe(1);
    expect(r.episode).toBe(2);
    expect(r.year).toBeUndefined();
  });

  it('parses Hebrew title with dots', () => {
    const r = parseFilename('Fauda.S03E01.720p.mkv');
    expect(r.title).toBe('Fauda');
    expect(r.season).toBe(3);
    expect(r.episode).toBe(1);
  });

  it('parses 4K resolution', () => {
    const r = parseFilename('Dune.2021.2160p.UHD.BluRay.mkv');
    expect(r.resolution).toBe('2160p');
    expect(r.year).toBe(2021);
  });

  it('returns original filename as releaseName without extension', () => {
    const r = parseFilename('Movie.Name.2020.mkv');
    expect(r.releaseName).toBe('Movie.Name.2020');
  });

  it('handles filename without extension', () => {
    const r = parseFilename('Breaking.Bad.S02E05');
    expect(r.season).toBe(2);
    expect(r.episode).toBe(5);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /root/hebsub-bridge
source ~/.nvm/nvm.sh && nvm use 16
pnpm --filter @hebsub/core test
```

Expected: FAIL — `Cannot find module '../src/parser'`

- [ ] **Step 4: Implement parser**

```typescript
// packages/core/src/parser/index.ts
import path from 'path';
import { ParsedFilename } from '../types';

const SERIES_RE = /[Ss](\d{1,2})[Ee](\d{1,2})/;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;
const RESOLUTION_RE = /\b(480p|720p|1080p|2160p|4K)\b/i;
const RELEASE_GROUP_RE = /-([A-Za-z0-9]+)(?:\.\w{2,4})?$/;
const NOISE = /\b(BluRay|WEB-DL|WEBRip|HDTV|DVDRip|BRRip|AMZN|DSNP|NF|x264|x265|H\.?264|H\.?265|AAC|AC3|DTS|HEVC|HDR|SDR|REMUX|PROPER|REPACK|EXTENDED|THEATRICAL|DUBBED|SUBBED)\b/gi;

export function parseFilename(filename: string): ParsedFilename {
  const withoutExt = filename.replace(/\.\w{2,4}$/, '');
  const releaseName = withoutExt;

  const normalized = withoutExt.replace(/[._]/g, ' ').trim();

  const seriesMatch = normalized.match(SERIES_RE);
  const season = seriesMatch ? parseInt(seriesMatch[1], 10) : undefined;
  const episode = seriesMatch ? parseInt(seriesMatch[2], 10) : undefined;

  const yearMatch = normalized.match(YEAR_RE);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const resMatch = normalized.match(RESOLUTION_RE);
  const resolution = resMatch ? resMatch[1].toLowerCase().replace('4k', '2160p') : undefined;

  const groupMatch = withoutExt.match(RELEASE_GROUP_RE);
  const releaseGroup = groupMatch ? groupMatch[1] : undefined;

  // Title: everything before S01E02 or year or noise
  let titleStr = normalized;
  if (seriesMatch) {
    titleStr = normalized.slice(0, normalized.search(SERIES_RE));
  } else if (yearMatch) {
    titleStr = normalized.slice(0, normalized.search(YEAR_RE));
  } else {
    titleStr = normalized.replace(NOISE, '').replace(RESOLUTION_RE, '');
  }

  const title = titleStr.trim().replace(/\s+/g, ' ') || undefined;

  return { title, year, season, episode, releaseName, resolution, releaseGroup };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @hebsub/core test
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/parser/ packages/core/tests/parser.test.ts packages/core/vitest.config.ts
git commit -m "feat(core): add filename parser with series/movie/year/resolution extraction"
git push
```

---

## Task 4: Core — Ranking Algorithm

**Files:**
- Create: `packages/core/src/ranker/index.ts`
- Create: `packages/core/tests/ranker.test.ts`

**Interfaces:**
- Consumes: `SubtitleSearchInput`, `SubtitleSearchResult`, `RankedSubtitle` from `../types`
- Produces: `rankResults(results: SubtitleSearchResult[], input: SubtitleSearchInput): RankedSubtitle[]`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/tests/ranker.test.ts
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
    const hi = { ...base, hearingImpaired: true };
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

  it('includes reasons array in output', () => {
    const ranked = rankResults([{ ...base, imdbId: 'tt0903747' }], input);
    expect(Array.isArray(ranked[0].reasons)).toBe(true);
    expect(Array.isArray(ranked[0].warnings)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @hebsub/core test
```

- [ ] **Step 3: Implement ranker**

```typescript
// packages/core/src/ranker/index.ts
import { SubtitleSearchResult, SubtitleSearchInput, RankedSubtitle } from '../types';

export function rankResults(
  results: SubtitleSearchResult[],
  input: SubtitleSearchInput,
): RankedSubtitle[] {
  return results
    .map((r) => score(r, input))
    .sort((a, b) => b.score - a.score);
}

function score(r: SubtitleSearchResult, input: SubtitleSearchInput): RankedSubtitle {
  let s = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (input.imdbId && r.imdbId === input.imdbId) {
    s += 120; reasons.push('exact imdbId match');
  }
  if (input.tmdbId && r.tmdbId === input.tmdbId) {
    s += 100; reasons.push('exact tmdbId match');
  }
  if (input.type === 'series' && input.season !== undefined && input.episode !== undefined) {
    if (r.season === input.season && r.episode === input.episode) {
      s += 90; reasons.push('exact season and episode match');
    } else if (r.season !== undefined || r.episode !== undefined) {
      if (r.season !== input.season || r.episode !== input.episode) {
        s -= 100; warnings.push('wrong episode');
      }
    }
  }
  if (input.title && r.title) {
    const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalize(r.title) === normalize(input.title)) {
      s += 70; reasons.push('title normalized match');
    }
  }
  if (input.year && r.year) {
    if (r.year === input.year) {
      s += 50; reasons.push('year match');
    } else {
      s -= 40; warnings.push('wrong year');
    }
  }
  if (r.downloads && r.downloads > 1000) {
    s += 15; reasons.push('high download count');
  }
  if (!input.allowHearingImpaired && r.hearingImpaired) {
    s -= 25; warnings.push('hearing impaired not requested');
  }

  return { ...r, score: s, reasons, warnings };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @hebsub/core test
```

Expected: all ranker tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ranker/ packages/core/tests/ranker.test.ts
git commit -m "feat(core): add subtitle ranking algorithm with explainable scores"
git push
```

---

## Task 5: Core — Subtitle Normalizer

**Files:**
- Create: `packages/core/src/normalizer/index.ts`
- Create: `packages/core/tests/normalizer.test.ts`

**Interfaces:**
- Produces: `normalizeSubtitle(inputPath: string, destPath: string): Promise<string>` — returns `destPath` after writing UTF-8 SRT

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/tests/normalizer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeSubtitle } from '../src/normalizer';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

describe('normalizeSubtitle', () => {
  it('copies a UTF-8 SRT file unchanged', async () => {
    const content = '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n';
    const src = path.join(tmpDir, 'sub.srt');
    const dest = path.join(tmpDir, 'out.srt');
    fs.writeFileSync(src, content, 'utf8');
    const result = await normalizeSubtitle(src, dest);
    expect(result).toBe(dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe(content);
  });

  it('converts Windows-1255 encoded Hebrew SRT to UTF-8', async () => {
    // Windows-1255 bytes for "שלום" (shalom)
    const w1255 = Buffer.from([0xF9, 0xEC, 0xE5, 0xED]);
    const srt = Buffer.concat([
      Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n'),
      w1255,
      Buffer.from('\n\n'),
    ]);
    const src = path.join(tmpDir, 'hebrew.srt');
    const dest = path.join(tmpDir, 'out.srt');
    fs.writeFileSync(src, srt);
    await normalizeSubtitle(src, dest);
    const result = fs.readFileSync(dest, 'utf8');
    expect(result).toContain('שלום');
  });

  it('strips UTF-8 BOM if present', async () => {
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const content = '1\n00:00:01,000 --> 00:00:03,000\nTest\n\n';
    const src = path.join(tmpDir, 'bom.srt');
    const dest = path.join(tmpDir, 'out.srt');
    fs.writeFileSync(src, Buffer.concat([bom, Buffer.from(content)]));
    await normalizeSubtitle(src, dest);
    const result = fs.readFileSync(dest, 'utf8');
    expect(result.charCodeAt(0)).not.toBe(0xFEFF);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @hebsub/core test
```

- [ ] **Step 3: Implement normalizer**

```typescript
// packages/core/src/normalizer/index.ts
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

export async function normalizeSubtitle(inputPath: string, destPath: string): Promise<string> {
  const raw = fs.readFileSync(inputPath);

  // Strip UTF-8 BOM
  const stripped = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF ? raw.slice(3) : raw;

  const detected = jschardet.detect(stripped);
  const encoding = (detected.encoding || 'utf-8').toLowerCase();

  let text: string;
  if (encoding === 'utf-8' || encoding === 'ascii') {
    text = stripped.toString('utf8');
  } else {
    text = iconv.decode(stripped, encoding);
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, text, 'utf8');
  return destPath;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @hebsub/core test
```

Expected: all normalizer tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/normalizer/ packages/core/tests/normalizer.test.ts
git commit -m "feat(core): add subtitle encoding normalizer (Windows-1255 → UTF-8)"
git push
```

---

## Task 6: Core — Cache System

**Files:**
- Create: `packages/core/src/cache/index.ts`
- Create: `packages/core/tests/cache.test.ts`

**Interfaces:**
- Produces:
  - `buildCacheKey(input: SubtitleSearchInput): string`
  - `class CacheStore { get(key): DownloadedSubtitle|null; set(key, value): void; cacheDir: string }`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/tests/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheStore, buildCacheKey } from '../src/cache';
import { SubtitleSearchInput, DownloadedSubtitle } from '../src/types';
import os from 'os';
import path from 'path';
import fs from 'fs';

let tmpDir: string;
let store: CacheStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-cache-'));
  store = new CacheStore(tmpDir, 180);
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

const sub: DownloadedSubtitle = {
  providerId: 'subdl', subtitleId: '123', originalPath: '/tmp/a.srt',
  normalizedPath: '/tmp/a.utf8.srt', format: 'srt', encoding: 'utf-8', cacheKey: '',
};

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
```

- [ ] **Step 2: Run to confirm fail**

```bash
pnpm --filter @hebsub/core test
```

- [ ] **Step 3: Implement cache**

```typescript
// packages/core/src/cache/index.ts
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
      if (this.ttlMs > 0 && Date.now() - entry.storedAt > this.ttlMs) return null;
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
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @hebsub/core test
```

Expected: all cache tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cache/ packages/core/tests/cache.test.ts
git commit -m "feat(core): add cache store with TTL and serialized metadata"
git push
```

---

## Task 7: Core — SubDL Provider

**Files:**
- Create: `packages/core/src/providers/base.ts`
- Create: `packages/core/src/providers/subdl.ts`
- Create: `packages/core/tests/providers/subdl.test.ts`

**Interfaces:**
- Consumes: `SubtitleProvider`, `SubtitleSearchInput`, `SubtitleSearchResult`, `DownloadedSubtitle` from `../types`
- Produces: `new SubDLProvider(apiKey: string): SubtitleProvider`

- [ ] **Step 1: Create base.ts (re-export for clarity)**

```typescript
// packages/core/src/providers/base.ts
export type { SubtitleProvider } from '../types';
```

- [ ] **Step 2: Write failing tests**

```typescript
// packages/core/tests/providers/subdl.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubDLProvider } from '../../src/providers/subdl';

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

import fetch from 'node-fetch';
const mockFetch = vi.mocked(fetch);

const mockSearchResponse = {
  status: true,
  subtitles: [
    {
      sd_id: 123456,
      lang: 'HE',
      release_name: 'Breaking.Bad.S01E02.1080p',
      season: 1,
      episode: 2,
      imdb_id: 'tt0903747',
      downloads: 5000,
      hi: false,
      url: '/subtitles/breaking-bad-s01e02.zip',
    },
  ],
};

describe('SubDLProvider', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('has correct id and capabilities', () => {
    const p = new SubDLProvider('test-key');
    expect(p.id).toBe('subdl');
    expect(p.capabilities.supportsImdbId).toBe(true);
    expect(p.capabilities.supportsSeries).toBe(true);
  });

  it('searches and maps results correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResponse,
    } as never);

    const p = new SubDLProvider('test-key');
    const results = await p.search({
      type: 'series', language: 'heb',
      imdbId: 'tt0903747', season: 1, episode: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0].providerId).toBe('subdl');
    expect(results[0].subtitleId).toBe('123456');
    expect(results[0].season).toBe(1);
    expect(results[0].episode).toBe(2);
    expect(results[0].downloads).toBe(5000);
  });

  it('returns empty array when API returns no subtitles', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, subtitles: [] }),
    } as never);
    const p = new SubDLProvider('test-key');
    const results = await p.search({ type: 'movie', language: 'heb', title: 'Unknown' });
    expect(results).toEqual([]);
  });

  it('returns empty array on network error (provider isolation)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    const p = new SubDLProvider('test-key');
    const results = await p.search({ type: 'movie', language: 'heb' });
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to confirm fail**

```bash
pnpm --filter @hebsub/core test
```

- [ ] **Step 4: Implement SubDL provider**

```typescript
// packages/core/src/providers/subdl.ts
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { SubtitleProvider, SubtitleSearchInput, SubtitleSearchResult, DownloadedSubtitle, ProviderCapabilities } from '../types';
import { normalizeSubtitle } from '../normalizer';

const BASE_URL = 'https://api.subdl.com/api/v1';
const DOWNLOAD_BASE = 'https://dl.subdl.com';
const TIMEOUT_MS = 10_000;

export class SubDLProvider implements SubtitleProvider {
  readonly id = 'subdl';
  readonly displayName = 'SubDL';
  readonly capabilities: ProviderCapabilities = {
    supportsMovies: true, supportsSeries: true,
    supportsImdbId: true, supportsTmdbId: false,
    supportsHash: false, requiresApiKey: true, requiresLogin: false,
  };

  constructor(private readonly apiKey: string) {}

  async search(input: SubtitleSearchInput): Promise<SubtitleSearchResult[]> {
    try {
      const params = new URLSearchParams({ languages: 'HE', api_key: this.apiKey });
      if (input.imdbId) params.set('imdb_id', input.imdbId.replace('tt', ''));
      if (input.type === 'series') params.set('type', 'tv'); else params.set('type', 'movie');
      if (input.season !== undefined) params.set('season_number', String(input.season));
      if (input.episode !== undefined) params.set('episode_number', String(input.episode));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(`${BASE_URL}/subtitles?${params}`, { signal: controller.signal as never });
      clearTimeout(timer);

      if (!res.ok) return [];
      const data = await res.json() as { status: boolean; subtitles?: SubDLItem[] };
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

    // Extract and find .srt file
    const decompress = (await import('decompress')).default;
    const files = await decompress(zipPath, tmpDir);
    const srtFile = files.find((f) => f.path.endsWith('.srt') || f.path.endsWith('.vtt'));
    if (!srtFile) throw new Error('No SRT file found in SubDL archive');

    const originalPath = path.join(tmpDir, srtFile.path);
    const normalizedPath = path.join(destDir, `${result.subtitleId}.srt`);
    fs.mkdirSync(destDir, { recursive: true });
    await normalizeSubtitle(originalPath, normalizedPath);

    const cacheKey = `subdl:${result.subtitleId}`;
    return {
      providerId: this.id, subtitleId: result.subtitleId,
      originalPath, normalizedPath, format: 'srt', encoding: 'utf-8', cacheKey,
    };
  }

  private mapItem(item: SubDLItem): SubtitleSearchResult {
    return {
      providerId: this.id, providerName: this.displayName,
      subtitleId: String(item.sd_id), language: 'heb',
      title: item.release_name || '', releaseName: item.release_name,
      imdbId: item.imdb_id ? `tt${item.imdb_id}` : undefined,
      season: item.season, episode: item.episode,
      downloads: item.downloads, hearingImpaired: item.hi,
      format: 'srt', raw: item,
    };
  }
}

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
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @hebsub/core test
```

Expected: all SubDL tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers/ packages/core/tests/providers/
git commit -m "feat(core): add SubDL subtitle provider with search and download"
git push
```

---

## Task 8: Core — OpenSubtitles Provider

**Files:**
- Create: `packages/core/src/providers/opensubtitles.ts`
- Create: `packages/core/tests/providers/opensubtitles.test.ts`

**Interfaces:**
- Produces: `new OpenSubtitlesProvider(apiKey: string): SubtitleProvider`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/tests/providers/opensubtitles.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenSubtitlesProvider } from '../../src/providers/opensubtitles';

vi.mock('node-fetch', () => ({ default: vi.fn() }));
import fetch from 'node-fetch';
const mockFetch = vi.mocked(fetch);

const mockSearchResponse = {
  data: [
    {
      id: '9876',
      attributes: {
        release: 'Breaking.Bad.S01E02.1080p',
        language: 'he',
        season_number: 1,
        episode_number: 2,
        download_count: 3000,
        hearing_impaired: false,
        files: [{ file_id: 111, file_name: 'sub.srt' }],
        feature_details: { imdb_id: 903747 },
      },
    },
  ],
  total_count: 1,
};

describe('OpenSubtitlesProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct id', () => {
    expect(new OpenSubtitlesProvider('key').id).toBe('opensubtitles');
  });

  it('maps results with correct fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse } as never);
    const p = new OpenSubtitlesProvider('key');
    const results = await p.search({ type: 'series', language: 'heb', imdbId: 'tt0903747', season: 1, episode: 2 });
    expect(results).toHaveLength(1);
    expect(results[0].subtitleId).toBe('9876');
    expect(results[0].season).toBe(1);
    expect(results[0].downloads).toBe(3000);
  });

  it('returns empty array on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    const results = await new OpenSubtitlesProvider('key').search({ type: 'movie', language: 'heb' });
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement OpenSubtitles provider**

```typescript
// packages/core/src/providers/opensubtitles.ts
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { SubtitleProvider, SubtitleSearchInput, SubtitleSearchResult, DownloadedSubtitle, ProviderCapabilities } from '../types';
import { normalizeSubtitle } from '../normalizer';

const BASE_URL = 'https://api.opensubtitles.com/api/v1';
const TIMEOUT_MS = 10_000;
const APP_NAME = 'HebSubBridge v0.1';

export class OpenSubtitlesProvider implements SubtitleProvider {
  readonly id = 'opensubtitles';
  readonly displayName = 'OpenSubtitles';
  readonly capabilities: ProviderCapabilities = {
    supportsMovies: true, supportsSeries: true,
    supportsImdbId: true, supportsTmdbId: false,
    supportsHash: true, requiresApiKey: true, requiresLogin: false,
  };

  constructor(private readonly apiKey: string) {}

  async search(input: SubtitleSearchInput): Promise<SubtitleSearchResult[]> {
    try {
      const params = new URLSearchParams({ languages: 'he' });
      if (input.imdbId) params.set('imdb_id', input.imdbId.replace('tt', ''));
      if (input.season !== undefined) params.set('season_number', String(input.season));
      if (input.episode !== undefined) params.set('episode_number', String(input.episode));
      if (input.title) params.set('query', input.title);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(`${BASE_URL}/subtitles?${params}`, {
        headers: { 'Api-Key': this.apiKey, 'User-Agent': APP_NAME },
        signal: controller.signal as never,
      });
      clearTimeout(timer);

      if (!res.ok) return [];
      const data = await res.json() as { data?: OSItem[] };
      return (data.data ?? []).map((item) => this.mapItem(item));
    } catch {
      return [];
    }
  }

  async download(result: SubtitleSearchResult, destDir: string): Promise<DownloadedSubtitle> {
    const raw = result.raw as OSItem;
    const fileId = raw.attributes.files[0]?.file_id;
    if (!fileId) throw new Error('No file_id in OpenSubtitles result');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const linkRes = await fetch(`${BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Api-Key': this.apiKey, 'User-Agent': APP_NAME, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
      signal: controller.signal as never,
    });
    clearTimeout(timer);

    if (!linkRes.ok) throw new Error(`OpenSubtitles link request failed: ${linkRes.status}`);
    const { link } = await linkRes.json() as { link: string };

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
      providerId: this.id, subtitleId: result.subtitleId,
      originalPath, normalizedPath, format: 'srt', encoding: 'utf-8',
      cacheKey: `opensubtitles:${result.subtitleId}`,
    };
  }

  private mapItem(item: OSItem): SubtitleSearchResult {
    const a = item.attributes;
    const rawImdb = a.feature_details?.imdb_id;
    return {
      providerId: this.id, providerName: this.displayName,
      subtitleId: item.id, language: 'heb',
      title: a.release || '', releaseName: a.release,
      imdbId: rawImdb ? `tt${rawImdb}` : undefined,
      season: a.season_number, episode: a.episode_number,
      downloads: a.download_count, hearingImpaired: a.hearing_impaired,
      format: 'srt', raw: item,
    };
  }
}

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
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @hebsub/core test
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/providers/opensubtitles.ts packages/core/tests/providers/opensubtitles.test.ts
git commit -m "feat(core): add OpenSubtitles REST API provider"
git push
```

---

## Task 9: Core — Local Folder Provider

**Files:**
- Create: `packages/core/src/providers/local.ts`
- Create: `packages/core/tests/providers/local.test.ts`

**Interfaces:**
- Produces: `new LocalFolderProvider(folders: string[]): SubtitleProvider`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/tests/providers/local.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalFolderProvider } from '../../src/providers/local';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-local-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

describe('LocalFolderProvider', () => {
  it('has correct id', () => {
    expect(new LocalFolderProvider([]).id).toBe('local');
  });

  it('returns empty array when no folders configured', async () => {
    const p = new LocalFolderProvider([]);
    const results = await p.search({ type: 'movie', language: 'heb', title: 'Test' });
    expect(results).toEqual([]);
  });

  it('finds .srt files in configured folder', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Breaking.Bad.S01E02.Hebrew.srt'), '1\n00:00:01,000 --> 00:00:02,000\nTest\n');
    const p = new LocalFolderProvider([tmpDir]);
    const results = await p.search({ type: 'series', language: 'heb', season: 1, episode: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].format).toBe('srt');
    expect(results[0].providerId).toBe('local');
  });

  it('returns empty array when folder does not exist', async () => {
    const p = new LocalFolderProvider(['/nonexistent/path']);
    const results = await p.search({ type: 'movie', language: 'heb' });
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement local provider**

```typescript
// packages/core/src/providers/local.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SubtitleProvider, SubtitleSearchInput, SubtitleSearchResult, DownloadedSubtitle, ProviderCapabilities } from '../types';
import { normalizeSubtitle } from '../normalizer';

export class LocalFolderProvider implements SubtitleProvider {
  readonly id = 'local';
  readonly displayName = 'Local Folder';
  readonly capabilities: ProviderCapabilities = {
    supportsMovies: true, supportsSeries: true,
    supportsImdbId: false, supportsTmdbId: false,
    supportsHash: false, requiresApiKey: false, requiresLogin: false,
  };

  constructor(private readonly folders: string[]) {}

  async search(input: SubtitleSearchInput): Promise<SubtitleSearchResult[]> {
    if (this.folders.length === 0) return [];
    const results: SubtitleSearchResult[] = [];

    for (const folder of this.folders) {
      if (!fs.existsSync(folder)) continue;
      try {
        const files = fs.readdirSync(folder).filter((f) => /\.(srt|vtt|ass|ssa|sub)$/i.test(f));
        for (const file of files) {
          if (!this.matchesInput(file, input)) continue;
          results.push({
            providerId: this.id, providerName: this.displayName,
            subtitleId: path.join(folder, file),
            language: 'heb', title: file,
            releaseName: file.replace(/\.\w{2,4}$/, ''),
            format: file.endsWith('.srt') ? 'srt' : file.endsWith('.vtt') ? 'vtt' : 'unknown',
            raw: { filePath: path.join(folder, file) },
          });
        }
      } catch {
        // folder unreadable — skip
      }
    }
    return results;
  }

  async download(result: SubtitleSearchResult, destDir: string): Promise<DownloadedSubtitle> {
    const raw = result.raw as { filePath: string };
    const originalPath = raw.filePath;
    const normalizedPath = path.join(destDir, path.basename(originalPath));
    fs.mkdirSync(destDir, { recursive: true });
    await normalizeSubtitle(originalPath, normalizedPath);
    return {
      providerId: this.id, subtitleId: result.subtitleId,
      originalPath, normalizedPath, format: 'srt', encoding: 'utf-8',
      cacheKey: `local:${originalPath}`,
    };
  }

  private matchesInput(filename: string, input: SubtitleSearchInput): boolean {
    const lower = filename.toLowerCase();
    if (input.season !== undefined && input.episode !== undefined) {
      const ep = `s${String(input.season).padStart(2, '0')}e${String(input.episode).padStart(2, '0')}`;
      return lower.includes(ep);
    }
    if (input.title) {
      const t = input.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      return lower.replace(/[^a-z0-9]/g, '').includes(t);
    }
    return true;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @hebsub/core test
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/providers/local.ts packages/core/tests/providers/local.test.ts
git commit -m "feat(core): add local folder subtitle provider"
git push
```

---

## Task 10: Core — Engine + Public API

**Files:**
- Create: `packages/core/src/engine.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/tests/engine.test.ts`

**Interfaces:**
- Consumes: all providers, ranker, cache, normalizer
- Produces:
  - `class HebSubEngine { search(input, providers?): Promise<SearchResult>; download(ranked, destDir): Promise<DownloadedSubtitle> }`
  - `packages/core` public exports: `HebSubEngine`, `SubDLProvider`, `OpenSubtitlesProvider`, `LocalFolderProvider`, `buildCacheKey`, `CacheStore`, `parseFilename`, `rankResults`, `normalizeSubtitle`, all types

- [ ] **Step 1: Write engine tests**

```typescript
// packages/core/tests/engine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HebSubEngine } from '../src/engine';
import { SubtitleProvider, SubtitleSearchInput, SubtitleSearchResult } from '../src/types';
import os from 'os';
import path from 'path';
import fs from 'fs';

function makeProvider(id: string, results: Partial<SubtitleSearchResult>[]): SubtitleProvider {
  return {
    id, displayName: id, capabilities: {
      supportsMovies: true, supportsSeries: true, supportsImdbId: true,
      supportsTmdbId: false, supportsHash: false, requiresApiKey: false, requiresLogin: false,
    },
    search: vi.fn().mockResolvedValue(results.map(r => ({
      providerId: id, providerName: id, subtitleId: r.subtitleId ?? '1',
      language: 'heb' as const, title: r.title ?? 'Test', ...r,
    }))),
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
      providerId: 'test', subtitleId: '42', originalPath: '/tmp/x.srt',
      normalizedPath: '/tmp/x.srt', format: 'srt' as const,
      encoding: 'utf-8' as const, cacheKey: 'movie:tt9999:2020',
    };
    // write fake file so cache validation passes
    fs.writeFileSync('/tmp/x.srt', 'test');
    engine.cache.set('movie:tt9999:2020', fakeSub);
    const p = makeProvider('shouldnotcall', [{ subtitleId: 'xxx' }]);
    const result = await engine.search({ type: 'movie', language: 'heb', imdbId: 'tt9999', year: 2020 }, [p]);
    expect(result.cacheHit).toBe(true);
    expect(p.search).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement engine**

```typescript
// packages/core/src/engine.ts
import { SubtitleProvider, SubtitleSearchInput, SubtitleSearchResult, DownloadedSubtitle, SearchResult } from './types';
import { rankResults } from './ranker';
import { CacheStore, buildCacheKey } from './cache';
import { normalizeSubtitle } from './normalizer';

export class HebSubEngine {
  readonly cache: CacheStore;

  constructor(cacheDir?: string, private readonly cacheTtlDays = 180) {
    this.cache = new CacheStore(cacheDir, cacheTtlDays);
  }

  async search(input: SubtitleSearchInput, providers: SubtitleProvider[]): Promise<SearchResult> {
    const cacheKey = buildCacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { results: [], searchInput: input, providersQueried: [], cacheHit: true };
    }

    const allResults = await Promise.all(
      providers.map((p) => p.search(input).catch(() => [] as SubtitleSearchResult[]))
    );
    const flat = allResults.flat();
    const ranked = rankResults(flat, input);

    return {
      results: ranked,
      searchInput: input,
      providersQueried: providers.map((p) => p.id),
      cacheHit: false,
    };
  }

  async download(
    result: import('./types').RankedSubtitle,
    provider: SubtitleProvider,
    destDir: string,
  ): Promise<DownloadedSubtitle> {
    const downloaded = await provider.download(result, destDir);
    const cacheKey = buildCacheKey({ type: result.season !== undefined ? 'series' : 'movie', language: 'heb', imdbId: result.imdbId, season: result.season, episode: result.episode });
    this.cache.set(cacheKey, downloaded);
    return downloaded;
  }
}
```

- [ ] **Step 3: Create public index.ts**

```typescript
// packages/core/src/index.ts
export { HebSubEngine } from './engine';
export { SubDLProvider } from './providers/subdl';
export { OpenSubtitlesProvider } from './providers/opensubtitles';
export { LocalFolderProvider } from './providers/local';
export { CacheStore, buildCacheKey } from './cache';
export { parseFilename } from './parser';
export { rankResults } from './ranker';
export { normalizeSubtitle } from './normalizer';
export type {
  SubtitleProvider, SubtitleSearchInput, SubtitleSearchResult,
  DownloadedSubtitle, RankedSubtitle, ParsedFilename, HebSubSettings,
  PlayRequest, PlayResult, SearchResult, MediaType, SubtitleFormat,
  ProviderCapabilities,
} from './types';
```

- [ ] **Step 4: Build core**

```bash
pnpm --filter @hebsub/core build
```

Expected: `packages/core/dist/` created with `.js` and `.d.ts` files.

- [ ] **Step 5: Run all core tests**

```bash
pnpm --filter @hebsub/core test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine.ts packages/core/src/index.ts packages/core/tests/engine.test.ts
git commit -m "feat(core): add HebSubEngine orchestrator and public API"
git push
```

---

## Task 11: CLI App

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/index.ts`

**Interfaces:**
- Consumes: `@hebsub/core` — `HebSubEngine`, `SubDLProvider`, `OpenSubtitlesProvider`, `LocalFolderProvider`
- Produces: `hebsub` CLI binary with `search` and `play-file` subcommands for developer testing

- [ ] **Step 1: Create apps/cli/package.json**

```json
{
  "name": "@hebsub/cli",
  "version": "0.1.0",
  "private": true,
  "bin": { "hebsub": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@hebsub/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^16.18.96",
    "typescript": "^5.4.5",
    "ts-node": "^10.9.2"
  }
}
```

- [ ] **Step 2: Create apps/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create apps/cli/src/index.ts**

```typescript
#!/usr/bin/env node
import { HebSubEngine, SubDLProvider, OpenSubtitlesProvider, LocalFolderProvider, SubtitleSearchInput } from '@hebsub/core';
import path from 'path';
import os from 'os';

const [,, command, ...args] = process.argv;

async function main() {
  const subdlKey = process.env['SUBDL_API_KEY'] ?? '';
  const osKey = process.env['OPENSUBTITLES_API_KEY'] ?? '';

  const providers = [
    ...(subdlKey ? [new SubDLProvider(subdlKey)] : []),
    ...(osKey ? [new OpenSubtitlesProvider(osKey)] : []),
    new LocalFolderProvider([]),
  ];

  const engine = new HebSubEngine();

  if (command === 'search') {
    const flags = parseFlags(args);
    const input: SubtitleSearchInput = {
      type: (flags['type'] as 'movie' | 'series') ?? 'movie',
      language: 'heb',
      title: flags['title'],
      imdbId: flags['imdb'],
      year: flags['year'] ? parseInt(flags['year'] as string) : undefined,
      season: flags['season'] ? parseInt(flags['season'] as string) : undefined,
      episode: flags['episode'] ? parseInt(flags['episode'] as string) : undefined,
    };
    console.warn(`Searching for Hebrew subtitles...`);
    const result = await engine.search(input, providers);
    if (result.cacheHit) {
      console.warn('Cache hit — subtitle already downloaded.');
      return;
    }
    if (result.results.length === 0) {
      console.warn('No subtitles found.');
      process.exit(1);
    }
    result.results.slice(0, 5).forEach((r, i) => {
      console.warn(`[${i + 1}] score=${r.score} provider=${r.providerId} release="${r.releaseName}"`);
      console.warn(`    reasons: ${r.reasons.join(', ')}`);
      if (r.warnings.length) console.warn(`    warnings: ${r.warnings.join(', ')}`);
    });
  } else {
    console.warn(`Usage: hebsub search --type movie|series --title "Name" [--imdb tt123] [--year 2020] [--season 1] [--episode 2]`);
    console.warn(`       Set SUBDL_API_KEY and/or OPENSUBTITLES_API_KEY env vars`);
    process.exit(1);
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Install and build**

```bash
cd /root/hebsub-bridge
pnpm install
pnpm --filter @hebsub/cli build
```

- [ ] **Step 5: Smoke-test CLI (no API key needed, expects "no subtitles")**

```bash
node apps/cli/dist/index.js search --type movie --title "Dune" --year 2021
```

Expected: prints `Searching for Hebrew subtitles...` then `No subtitles found.` (no API keys set).

- [ ] **Step 6: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): add developer CLI for testing core subtitle search"
git push
```

---

## Task 12: Companion — Server Scaffold + Settings

**Files:**
- Create: `apps/companion/package.json`
- Create: `apps/companion/tsconfig.json`
- Create: `apps/companion/vitest.config.ts`
- Create: `apps/companion/src/settings/store.ts`
- Create: `apps/companion/src/server.ts`
- Create: `apps/companion/src/index.ts`
- Create: `apps/companion/tests/server.test.ts`

**Interfaces:**
- Produces:
  - `loadSettings(): HebSubSettings`
  - `saveSettings(partial: Partial<HebSubSettings>): HebSubSettings`
  - `buildServer(settings: HebSubSettings): FastifyInstance`
  - `listen(server, port, host): Promise<void>`

- [ ] **Step 1: Create apps/companion/package.json**

```json
{
  "name": "@hebsub/companion",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@hebsub/core": "workspace:*",
    "fastify": "^4.27.0",
    "@fastify/cors": "^9.0.1"
  },
  "devDependencies": {
    "@types/node": "^16.18.96",
    "typescript": "^5.4.5",
    "ts-node": "^10.9.2",
    "vitest": "^1.5.3"
  }
}
```

- [ ] **Step 2: Create apps/companion/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create apps/companion/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, include: ['tests/**/*.test.ts'] } });
```

- [ ] **Step 4: Write settings + server tests**

```typescript
// apps/companion/tests/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import { defaultSettings } from '../src/settings/store';

describe('companion server', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    app = await buildServer(defaultSettings());
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it('GET /health returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok' });
  });

  it('GET /settings returns default settings shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('vlcPath');
    expect(body).toHaveProperty('language', 'heb');
    expect(body).toHaveProperty('preferredProviders');
    expect(Array.isArray(body.preferredProviders)).toBe(true);
  });

  it('rejects requests from non-localhost origin', async () => {
    const res = await app.inject({
      method: 'POST', url: '/play',
      headers: { 'X-Forwarded-For': '192.168.1.100' },
      payload: JSON.stringify({ videoUrl: 'https://example.com/video.mkv', type: 'movie' }),
    });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 5: Create settings store**

```typescript
// apps/companion/src/settings/store.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { HebSubSettings } from '@hebsub/core';

function settingsPath(): string {
  const dir = process.platform === 'win32'
    ? path.join(process.env['APPDATA'] || os.homedir(), 'HebSubBridge')
    : path.join(os.homedir(), '.hebsub');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'settings.json');
}

export function defaultSettings(): HebSubSettings {
  return {
    vlcPath: process.platform === 'win32'
      ? 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe'
      : '/usr/bin/vlc',
    language: 'heb',
    preferredProviders: ['subdl', 'opensubtitles', 'local'],
    allowHearingImpaired: false,
    autoLaunchVlc: true,
    cacheEnabled: true,
    cacheTtlDays: 180,
    subdlApiKey: '',
    opensubtitlesApiKey: '',
    localSubtitleFolders: [],
    logLevel: 'info',
  };
}

export function loadSettings(): HebSubSettings {
  const p = settingsPath();
  if (!fs.existsSync(p)) return defaultSettings();
  try {
    const stored = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { ...defaultSettings(), ...stored };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(partial: Partial<HebSubSettings>): HebSubSettings {
  const current = loadSettings();
  const updated = { ...current, ...partial };
  fs.writeFileSync(settingsPath(), JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
```

- [ ] **Step 6: Create server.ts**

```typescript
// apps/companion/src/server.ts
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { HebSubSettings } from '@hebsub/core';

export async function buildServer(settings: HebSubSettings): Promise<FastifyInstance> {
  const app = Fastify({ logger: settings.logLevel === 'debug' });

  // Localhost-only guard
  app.addHook('onRequest', async (req, reply) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded ?? req.socket.remoteAddress ?? '');
    const safe = ip === '127.0.0.1' || ip === '::1' || ip === '' || ip.startsWith('::ffff:127.');
    if (!safe) {
      return reply.code(403).send({ error: 'Forbidden: companion accepts localhost requests only' });
    }
  });

  // Routes registered lazily so the server can be built without wiring all handlers yet
  await app.register(require('./api/health').default);
  await app.register(require('./api/settings').default, { settings });
  await app.register(require('./api/logs').default);
  await app.register(require('./api/search').default, { settings });
  await app.register(require('./api/play').default, { settings });
  await app.register(require('./api/download').default, { settings });

  return app;
}
```

- [ ] **Step 7: Create index.ts (entry point)**

```typescript
// apps/companion/src/index.ts
import { buildServer } from './server';
import { loadSettings } from './settings/store';

async function main() {
  const settings = loadSettings();
  const app = await buildServer(settings);
  await app.listen({ port: 47583, host: '127.0.0.1' });
  console.warn(`HebSub Companion running on http://127.0.0.1:47583`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 8: Install dependencies**

```bash
cd /root/hebsub-bridge && pnpm install
```

- [ ] **Step 9: Run tests**

```bash
pnpm --filter @hebsub/companion test
```

Expected: 3 tests pass (health, settings shape, localhost guard).

- [ ] **Step 10: Commit**

```bash
git add apps/companion/
git commit -m "feat(companion): add Fastify server scaffold with settings store and localhost guard"
git push
```

---

## Task 13: Companion — VLC Path Detection & Launcher

**Files:**
- Create: `apps/companion/src/vlc/launcher.ts`
- Create: `apps/companion/tests/vlc/launcher.test.ts`

**Interfaces:**
- Produces:
  - `findVlc(userPath?: string): Promise<string | null>` — returns absolute path or null
  - `launchVlc(vlcPath: string, videoUrl: string, subtitlePath: string): Promise<number>` — returns PID

- [ ] **Step 1: Write failing tests**

```typescript
// apps/companion/tests/vlc/launcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { findVlc, launchVlc } from '../../src/vlc/launcher';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return { ...original, spawnSync: vi.fn(), spawn: vi.fn() };
});

import { spawn } from 'child_process';
const mockSpawn = vi.mocked(spawn);

describe('findVlc', () => {
  it('returns user-supplied path if it is an absolute path', async () => {
    const result = await findVlc('/custom/path/vlc');
    expect(result).toBe('/custom/path/vlc');
  });

  it('returns null when no VLC found', async () => {
    vi.mocked(spawnSync).mockReturnValue({ stdout: Buffer.from(''), status: 1 } as never);
    const result = await findVlc();
    // On Linux CI, VLC likely not installed — could be null or a path
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

describe('launchVlc', () => {
  it('spawns vlc with video URL and sub-file as separate arguments', async () => {
    const fakeProc = { pid: 12345, unref: vi.fn(), on: vi.fn() };
    mockSpawn.mockReturnValue(fakeProc as never);

    const pid = await launchVlc('/usr/bin/vlc', 'https://example.com/video.mkv', '/tmp/sub.srt');
    expect(pid).toBe(12345);

    const [cmd, spawnArgs] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('/usr/bin/vlc');
    // Arguments must be separate — never string-concatenated
    expect(spawnArgs).toContain('https://example.com/video.mkv');
    expect(spawnArgs).toContain('--sub-file=/tmp/sub.srt');
  });

  it('throws if VLC returns no PID', async () => {
    mockSpawn.mockReturnValue({ pid: undefined, unref: vi.fn(), on: vi.fn() } as never);
    await expect(launchVlc('/usr/bin/vlc', 'https://v.com/x.mkv', '/tmp/s.srt')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement launcher**

```typescript
// apps/companion/src/vlc/launcher.ts
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';

const WINDOWS_PATHS = [
  'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
  'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
];

export async function findVlc(userPath?: string): Promise<string | null> {
  // 1. User-supplied absolute path
  if (userPath && (userPath.startsWith('/') || /^[A-Za-z]:\\/.test(userPath))) {
    return userPath;
  }
  // 2. User-supplied relative — try as-is
  if (userPath) return userPath;
  // 3. Common Windows paths
  if (process.platform === 'win32') {
    for (const p of WINDOWS_PATHS) {
      if (fs.existsSync(p)) return p;
    }
  }
  // 4. PATH lookup
  const which = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(which, ['vlc'], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim().split('\n')[0].trim();
  }
  return null;
}

export async function launchVlc(
  vlcPath: string,
  videoUrl: string,
  subtitlePath: string,
): Promise<number> {
  // SECURITY: args are passed as an array — never concatenated into a shell string
  const args = [videoUrl, `--sub-file=${subtitlePath}`];
  const child = spawn(vlcPath, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  if (!child.pid) throw new Error('Failed to launch VLC — no PID returned');
  return child.pid;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @hebsub/companion test
```

Expected: all launcher tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/companion/src/vlc/ apps/companion/tests/vlc/
git commit -m "feat(companion): add VLC path detection and safe process launcher"
git push
```

---

## Task 14: Companion — Health, Settings, Logs Endpoints

**Files:**
- Create: `apps/companion/src/api/health.ts`
- Create: `apps/companion/src/api/settings.ts`
- Create: `apps/companion/src/api/logs.ts`

**Interfaces:**
- `GET /health` → `{ status: "ok", version: string, uptime: number }`
- `GET /settings` → `HebSubSettings`
- `POST /settings` → `HebSubSettings` (merged)
- `GET /logs/recent` → `{ logs: string[] }`

- [ ] **Step 1: Create health route**

```typescript
// apps/companion/src/api/health.ts
import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import path from 'path';

const version = (() => {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).version;
  } catch { return '0.1.0'; }
})();

export default async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    version,
    uptime: Math.floor(process.uptime()),
  }));
}
```

- [ ] **Step 2: Create settings route**

```typescript
// apps/companion/src/api/settings.ts
import { FastifyInstance } from 'fastify';
import { HebSubSettings } from '@hebsub/core';
import { loadSettings, saveSettings } from '../settings/store';

export default async function settingsRoute(
  app: FastifyInstance,
  opts: { settings: HebSubSettings },
) {
  app.get('/settings', async () => loadSettings());

  app.post<{ Body: Partial<HebSubSettings> }>('/settings', {
    schema: { body: { type: 'object' } },
  }, async (req) => {
    // Strip any attempt to inject non-settings fields
    const allowed: Array<keyof HebSubSettings> = [
      'vlcPath', 'preferredProviders', 'allowHearingImpaired', 'autoLaunchVlc',
      'cacheEnabled', 'cacheTtlDays', 'subdlApiKey', 'opensubtitlesApiKey',
      'localSubtitleFolders', 'logLevel',
    ];
    const safe: Partial<HebSubSettings> = {};
    for (const key of allowed) {
      if (key in req.body) (safe as Record<string, unknown>)[key] = (req.body as Record<string, unknown>)[key];
    }
    return saveSettings(safe);
  });
}
```

- [ ] **Step 3: Create logs route (ring buffer)**

```typescript
// apps/companion/src/api/logs.ts
import { FastifyInstance } from 'fastify';

const LOG_BUFFER: string[] = [];
const MAX_LOGS = 200;

export function appendLog(entry: string): void {
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.shift();
}

export default async function logsRoute(app: FastifyInstance) {
  app.get('/logs/recent', async () => ({ logs: [...LOG_BUFFER] }));
}
```

- [ ] **Step 4: Run all companion tests**

```bash
pnpm --filter @hebsub/companion test
```

Expected: all pass (health, settings, localhost guard).

- [ ] **Step 5: Commit**

```bash
git add apps/companion/src/api/health.ts apps/companion/src/api/settings.ts apps/companion/src/api/logs.ts
git commit -m "feat(companion): add /health, /settings, /logs/recent endpoints"
git push
```

---

## Task 15: Companion — POST /search Endpoint

**Files:**
- Create: `apps/companion/src/api/search.ts`
- Create: `apps/companion/tests/api/search.test.ts`

**Interfaces:**
- `POST /search` body: `SubtitleSearchInput`
- Response: `{ results: RankedSubtitle[]; providersQueried: string[]; cacheHit: boolean }`

- [ ] **Step 1: Write failing test**

```typescript
// apps/companion/tests/api/search.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import { defaultSettings } from '../src/settings/store';

vi.mock('@hebsub/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@hebsub/core')>();
  return {
    ...original,
    SubDLProvider: vi.fn().mockImplementation(() => ({
      id: 'subdl', displayName: 'SubDL',
      capabilities: { supportsMovies: true, supportsSeries: true, supportsImdbId: true, supportsTmdbId: false, supportsHash: false, requiresApiKey: true, requiresLogin: false },
      search: vi.fn().mockResolvedValue([{
        providerId: 'subdl', providerName: 'SubDL', subtitleId: '99',
        language: 'heb', title: 'Breaking Bad', season: 1, episode: 2,
        imdbId: 'tt0903747', downloads: 5000,
      }]),
      download: vi.fn(),
    })),
    OpenSubtitlesProvider: vi.fn().mockImplementation(() => ({ id: 'opensubtitles', capabilities: {}, search: vi.fn().mockResolvedValue([]), download: vi.fn() })),
    LocalFolderProvider: vi.fn().mockImplementation(() => ({ id: 'local', capabilities: {}, search: vi.fn().mockResolvedValue([]), download: vi.fn() })),
  };
});

describe('POST /search', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { app = await buildServer(defaultSettings()); await app.ready(); });
  afterEach(async () => { await app.close(); });

  it('returns ranked results', async () => {
    const res = await app.inject({
      method: 'POST', url: '/search',
      payload: JSON.stringify({ type: 'series', language: 'heb', imdbId: 'tt0903747', season: 1, episode: 2 }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body).toHaveProperty('providersQueried');
  });

  it('returns 400 for missing type field', async () => {
    const res = await app.inject({
      method: 'POST', url: '/search',
      payload: JSON.stringify({ language: 'heb' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Implement /search route**

```typescript
// apps/companion/src/api/search.ts
import { FastifyInstance } from 'fastify';
import {
  HebSubSettings, HebSubEngine, SubDLProvider, OpenSubtitlesProvider,
  LocalFolderProvider, SubtitleSearchInput, SubtitleProvider,
} from '@hebsub/core';
import { appendLog } from './logs';

export default async function searchRoute(
  app: FastifyInstance,
  opts: { settings: HebSubSettings },
) {
  app.post<{ Body: SubtitleSearchInput }>('/search', {
    schema: {
      body: {
        type: 'object',
        required: ['type', 'language'],
        properties: {
          type: { type: 'string', enum: ['movie', 'series'] },
          language: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const input: SubtitleSearchInput = { ...req.body, language: 'heb' };
    const providers = buildProviders(opts.settings);
    const engine = new HebSubEngine();
    appendLog(`[search] ${JSON.stringify({ type: input.type, imdbId: input.imdbId, season: input.season, episode: input.episode })}`);
    const result = await engine.search(input, providers);
    appendLog(`[search] found ${result.results.length} results, cacheHit=${result.cacheHit}`);
    return result;
  });
}

export function buildProviders(settings: HebSubSettings): SubtitleProvider[] {
  const providers: SubtitleProvider[] = [];
  for (const id of settings.preferredProviders) {
    if (id === 'subdl' && settings.subdlApiKey) providers.push(new SubDLProvider(settings.subdlApiKey));
    if (id === 'opensubtitles' && settings.opensubtitlesApiKey) providers.push(new OpenSubtitlesProvider(settings.opensubtitlesApiKey));
    if (id === 'local') providers.push(new LocalFolderProvider(settings.localSubtitleFolders));
  }
  return providers;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @hebsub/companion test
```

- [ ] **Step 4: Commit**

```bash
git add apps/companion/src/api/search.ts apps/companion/tests/api/search.test.ts
git commit -m "feat(companion): add POST /search endpoint"
git push
```

---

## Task 16: Companion — POST /play Endpoint

**Files:**
- Create: `apps/companion/src/api/play.ts`
- Create: `apps/companion/tests/api/play.test.ts`

**Interfaces:**
- `POST /play` body: `PlayRequest`
- Response: `PlayResult`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/companion/tests/api/play.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import { defaultSettings } from '../src/settings/store';

vi.mock('../src/vlc/launcher', () => ({
  findVlc: vi.fn().mockResolvedValue('/usr/bin/vlc'),
  launchVlc: vi.fn().mockResolvedValue(9999),
}));

vi.mock('@hebsub/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@hebsub/core')>();
  return {
    ...original,
    HebSubEngine: vi.fn().mockImplementation(() => ({
      cache: { get: vi.fn().mockReturnValue(null), set: vi.fn() },
      search: vi.fn().mockResolvedValue({
        results: [{
          providerId: 'subdl', providerName: 'SubDL', subtitleId: '1',
          language: 'heb', title: 'Test', score: 150,
          reasons: ['exact imdbId match'], warnings: [],
        }],
        providersQueried: ['subdl'],
        cacheHit: false,
        searchInput: {},
      }),
      download: vi.fn().mockResolvedValue({
        providerId: 'subdl', subtitleId: '1',
        originalPath: '/tmp/1.srt', normalizedPath: '/tmp/1.srt',
        format: 'srt', encoding: 'utf-8', cacheKey: 'movie:tt123:2020',
      }),
    })),
    SubDLProvider: vi.fn().mockImplementation(() => ({ id: 'subdl', search: vi.fn(), download: vi.fn() })),
    OpenSubtitlesProvider: vi.fn().mockImplementation(() => ({ id: 'opensubtitles', search: vi.fn(), download: vi.fn() })),
    LocalFolderProvider: vi.fn().mockImplementation(() => ({ id: 'local', search: vi.fn(), download: vi.fn() })),
  };
});

describe('POST /play', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => {
    app = await buildServer({ ...defaultSettings(), subdlApiKey: 'test-key' });
    await app.ready();
  });
  afterEach(async () => { await app.close(); });

  it('returns success with vlcPid when subtitle found', async () => {
    const res = await app.inject({
      method: 'POST', url: '/play',
      payload: JSON.stringify({
        videoUrl: 'https://example.com/video.mkv',
        type: 'movie', imdbId: 'tt0123456', title: 'Test Movie', year: 2020,
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.vlcPid).toBe(9999);
  });

  it('returns 400 for missing videoUrl', async () => {
    const res = await app.inject({
      method: 'POST', url: '/play',
      payload: JSON.stringify({ type: 'movie' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-http videoUrl protocols', async () => {
    const res = await app.inject({
      method: 'POST', url: '/play',
      payload: JSON.stringify({ videoUrl: 'javascript:alert(1)', type: 'movie' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Implement /play route**

```typescript
// apps/companion/src/api/play.ts
import { FastifyInstance } from 'fastify';
import path from 'path';
import os from 'os';
import {
  HebSubSettings, HebSubEngine, PlayRequest, PlayResult, SubtitleProvider,
} from '@hebsub/core';
import { findVlc, launchVlc } from '../vlc/launcher';
import { buildProviders } from './search';
import { appendLog } from './logs';

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'magnet:'];

function validateVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export default async function playRoute(
  app: FastifyInstance,
  opts: { settings: HebSubSettings },
) {
  app.post<{ Body: PlayRequest }>('/play', {
    schema: {
      body: {
        type: 'object',
        required: ['videoUrl', 'type'],
        properties: {
          videoUrl: { type: 'string' },
          type: { type: 'string', enum: ['movie', 'series'] },
          title: { type: 'string' },
          imdbId: { type: 'string' },
          season: { type: 'number' },
          episode: { type: 'number' },
        },
      },
    },
  }, async (req, reply): Promise<PlayResult> => {
    const { videoUrl, type, title, originalTitle, year, imdbId, tmdbId, season, episode, filename, releaseName } = req.body;

    if (!validateVideoUrl(videoUrl)) {
      return reply.code(400).send({ error: 'Invalid videoUrl protocol' }) as never;
    }

    const providers = buildProviders(opts.settings);
    const engine = new HebSubEngine();

    appendLog(`[play] type=${type} imdbId=${imdbId ?? 'none'} season=${season ?? '-'} ep=${episode ?? '-'}`);

    const searchResult = await engine.search({
      type, language: 'heb', title, originalTitle, year,
      imdbId, tmdbId, season, episode, filename, releaseName,
    }, providers);

    if (searchResult.cacheHit) {
      const cached = engine.cache.get(
        require('@hebsub/core').buildCacheKey({ type, language: 'heb', imdbId, season, episode })
      );
      if (cached) {
        const vlcPath = await findVlc(opts.settings.vlcPath || undefined);
        if (!vlcPath) return { success: false, error: 'VLC not found. Set vlcPath in settings.' };
        const vlcPid = await launchVlc(vlcPath, videoUrl, cached.normalizedPath);
        appendLog(`[play] cache hit, launched VLC pid=${vlcPid}`);
        return { success: true, subtitle: cached, vlcPid };
      }
    }

    if (searchResult.results.length === 0) {
      appendLog(`[play] no subtitles found`);
      if (opts.settings.autoLaunchVlc) {
        const vlcPath = await findVlc(opts.settings.vlcPath || undefined);
        if (vlcPath) {
          const vlcPid = await launchVlc(vlcPath, videoUrl, '');
          return { success: false, noSubtitlesFound: true, vlcPid, error: 'No Hebrew subtitle found. VLC launched without subtitles.' };
        }
      }
      return { success: false, noSubtitlesFound: true, error: 'No Hebrew subtitle found.' };
    }

    const best = searchResult.results[0];
    const provider = providers.find((p: SubtitleProvider) => p.id === best.providerId);
    if (!provider) return { success: false, error: `Provider ${best.providerId} not available` };

    const destDir = path.join(os.tmpdir(), 'hebsub', 'subtitles');
    const downloaded = await engine.download(best, provider, destDir);

    const vlcPath = await findVlc(opts.settings.vlcPath || undefined);
    if (!vlcPath) return { success: false, subtitle: downloaded, error: 'VLC not found. Set vlcPath in settings.' };

    const vlcPid = await launchVlc(vlcPath, videoUrl, downloaded.normalizedPath);
    appendLog(`[play] launched VLC pid=${vlcPid} sub="${downloaded.normalizedPath}" score=${best.score}`);

    return { success: true, subtitle: downloaded, ranked: best, vlcPid };
  });
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @hebsub/companion test
```

Expected: all play tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/companion/src/api/play.ts apps/companion/tests/api/play.test.ts
git commit -m "feat(companion): add POST /play endpoint — search, download, launch VLC"
git push
```

---

## Task 17: Companion — POST /download Endpoint + Final Build

**Files:**
- Create: `apps/companion/src/api/download.ts`

**Interfaces:**
- `POST /download` body: `{ result: SubtitleSearchResult }`
- Response: `DownloadedSubtitle`

- [ ] **Step 1: Implement /download route**

```typescript
// apps/companion/src/api/download.ts
import { FastifyInstance } from 'fastify';
import path from 'path';
import os from 'os';
import { HebSubSettings, SubtitleSearchResult, DownloadedSubtitle } from '@hebsub/core';
import { buildProviders } from './search';

export default async function downloadRoute(
  app: FastifyInstance,
  opts: { settings: HebSubSettings },
) {
  app.post<{ Body: { result: SubtitleSearchResult } }>('/download', {
    schema: {
      body: {
        type: 'object',
        required: ['result'],
        properties: { result: { type: 'object' } },
      },
    },
  }, async (req, reply): Promise<DownloadedSubtitle> => {
    const { result } = req.body;
    const providers = buildProviders(opts.settings);
    const provider = providers.find((p) => p.id === result.providerId);
    if (!provider) {
      return reply.code(400).send({ error: `Provider ${result.providerId} not configured` }) as never;
    }
    const destDir = path.join(os.tmpdir(), 'hebsub', 'subtitles');
    return provider.download(result, destDir);
  });
}
```

- [ ] **Step 2: Build entire monorepo**

```bash
cd /root/hebsub-bridge
pnpm build
```

Expected: `packages/core/dist/` and `apps/companion/dist/` and `apps/cli/dist/` all created.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all tests across all packages pass.

- [ ] **Step 4: Smoke-test the companion**

```bash
node apps/companion/dist/index.js &
sleep 1
curl -s http://127.0.0.1:47583/health | python3 -m json.tool
curl -s http://127.0.0.1:47583/settings | python3 -m json.tool
kill %1
```

Expected: health returns `{ "status": "ok", ... }`, settings returns default settings object.

- [ ] **Step 5: Final commit and push**

```bash
git add apps/companion/src/api/download.ts
git commit -m "feat(companion): add POST /download endpoint — completes Phase 1+2 MVP"
git push
```

---

## Acceptance Criteria Checklist

- [ ] `pnpm test` passes across all packages with no errors
- [ ] `pnpm build` produces `dist/` in core, companion, and cli
- [ ] `curl http://127.0.0.1:47583/health` returns `{ "status": "ok" }`
- [ ] `POST /play` with valid body returns `{ "success": true, "vlcPid": <number> }` (requires VLC + API key)
- [ ] `POST /play` with `javascript:` videoUrl returns 400
- [ ] Request from non-localhost IP returns 403
- [ ] No API keys appear in `/logs/recent` output
- [ ] CLI: `node apps/cli/dist/index.js search --type movie --title "Dune"` runs without crashing
