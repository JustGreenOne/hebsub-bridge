# HebSub Bridge — Full Technical Design

Version: 1.0  
Date: 27 June 2026  
Scope: Windows-first MVP with Stremio addon, VLC companion, and optional VLC Lua extension  
Tooling: TypeScript monorepo, pnpm workspaces, Turborepo, public GitHub repo

---

## 1. Problem

Stremio's internal player stutters on Full HD and 4K video. VLC plays the same content smoothly. The missing piece is automatic Hebrew subtitles when the video is opened in VLC. The solution is a modular bridge: a shared subtitle engine, a local companion app that launches VLC, and a Stremio subtitle addon.

---

## 2. Final Architecture Recommendation

```
Stremio (internal player / streams)
         |
         | subtitle requests or special stream item
         v
Stremio Subtitle Addon   /manifest.json  /subtitles/:type/:id.json
         |
         | shared subtitle search
         v
HebSub Core   providers / parser / ranker / cache / encoding-normalizer
         |
         | best Hebrew subtitle
         v
Local VLC Companion App   127.0.0.1:47583   /play  /search  /settings
         |
         | launch command
         v
VLC   vlc.exe "<videoUrl>" --sub-file="<absoluteSubtitlePath>"
```

Do NOT start with a VLC Lua plugin as the main solution.

---

## 3. Monorepo Layout

```
hebsub-bridge/
  packages/
    core/
      src/
        providers/
        parser/
        ranker/
        cache/
        subtitle-normalizer/
        types/
      tests/
  apps/
    companion/
      src/
        api/
        vlc/
        settings/
      tray/
      tests/
    stremio-addon/
      src/
        manifest.ts
        subtitles.ts
        stream-bridge.ts
      tests/
    cli/
      src/
  docs/
    setup-windows.md
    provider-api.md
    troubleshooting.md
  package.json           ← pnpm workspace root
  pnpm-workspace.yaml
  turbo.json
  README.md
```

---

## 4. Goals

- Open Stremio videos in VLC with Hebrew subtitles automatically.
- Support movies and TV episodes including season/episode matching.
- Prefer official subtitle APIs first; community providers only after legal review.
- Cache subtitles locally so repeated playback does not re-download.
- Normalize subtitle files to UTF-8 SRT or VTT for reliable Hebrew display.
- Keep subtitle logic reusable across Stremio addon, companion, CLI, and optional VLC extension.
- Package a Windows-first MVP that a non-developer can run.

## 5. Non-Goals

- Do not bypass DRM, paywalls, captchas, or website protections.
- Do not hardcode private credentials or scrape protected services without permission.
- Do not depend on modifying Stremio source code.
- Do not build a full media player.
- Do not guarantee a perfect Hebrew subtitle for every release; fail gracefully.

---

## 6. Core Package (`packages/core`)

The core must not know whether it is called from Stremio, VLC, CLI, or any other app. Its only job is to turn media metadata into a subtitle file.

### Responsibilities

- Parse media metadata from filename, title, IMDb ID, TMDb ID, season, episode, release name.
- Search multiple providers in parallel or priority order.
- Rank results with a consistent, explainable scoring algorithm.
- Download selected subtitle archives or files.
- Extract ZIP/RAR/GZ safely.
- Detect encoding and normalize Hebrew subtitles to UTF-8.
- Convert subtitle format to SRT or VTT when needed.
- Cache successful results and store metadata JSON for debugging.

### TypeScript Provider Interface

```ts
export interface SubtitleProvider {
  id: string;
  displayName: string;
  capabilities: ProviderCapabilities;
  search(input: SubtitleSearchInput): Promise<SubtitleSearchResult[]>;
  download(result: SubtitleSearchResult): Promise<DownloadedSubtitle>;
}

export type ProviderCapabilities = {
  supportsMovies: boolean;
  supportsSeries: boolean;
  supportsImdbId?: boolean;
  supportsTmdbId?: boolean;
  supportsHash?: boolean;
  requiresApiKey?: boolean;
  requiresLogin?: boolean;
};

export type SubtitleSearchInput = {
  type: "movie" | "series";
  language: "heb";
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
};

export type SubtitleSearchResult = {
  providerId: string;
  providerName: string;
  subtitleId: string;
  language: "heb";
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
  format?: "srt" | "vtt" | "ass" | "ssa" | "sub" | "unknown";
  raw?: unknown;
};

export type DownloadedSubtitle = {
  providerId: string;
  subtitleId: string;
  originalPath: string;
  normalizedPath: string;
  format: "srt" | "vtt";
  encoding: "utf-8";
  cacheKey: string;
};
```

---

## 7. Subtitle Providers (Priority Order for MVP)

| Priority | Provider              | Why                                          | Note                                  |
|----------|-----------------------|----------------------------------------------|---------------------------------------|
| 1        | SubDL official API    | Structured search; supports IMDb ID + lang   | API key from local settings           |
| 2        | OpenSubtitles REST    | Large database; supports hash/name search    | Respect rate limits and auth rules    |
| 3        | Local folder          | Manual fallback and testing                  | Scan configured subtitle folders      |
| 4        | Wizdom adapter        | Important Hebrew source                      | Add only after legal/technical review |
| 5        | Ktuvit adapter        | Important Hebrew source                      | May need login; fragile; optional     |

### Provider Rules

- Every provider must have a timeout and failure isolation.
- Never log API keys, passwords, cookies, or authorization headers.
- Use official APIs first. Scrapers disabled by default unless verified safe.
- Add provider-specific integration tests using mocked HTTP responses.

---

## 8. Ranking Algorithm

```
score = 0

+120  exact imdbId match
+100  exact tmdbId match
+90   exact season and episode for series
+70   title normalized match
+50   year match for movies
+45   release name token match
+35   video hash match, when available
+25   trusted provider bonus
+15   high download count or rating

-100  wrong season or wrong episode
-70   wrong imdbId or tmdbId
-40   wrong year
-25   hearing impaired when user did not request it
-20   low confidence filename-only result
-15   archive contains multiple unclear subtitle files
```

Output type:
```ts
export type RankedSubtitle = SubtitleSearchResult & {
  score: number;
  reasons: string[];
  warnings: string[];
};
```

---

## 9. Cache and File Management

**Windows cache path:** `%APPDATA%\HebSubBridge\cache\subtitles\`

**Cache key format:**
- Movie: `movie:<imdbId or tmdbId>:<year>:<normalizedTitle>:<releaseNameHash>`
- Series: `series:<imdbId or tmdbId>:S<season>E<episode>:<releaseNameHash>`
- File: `file:<videoHash>:<videoSize>`

**Behavior:**
- Use cached subtitle if previously selected successfully for the same media key.
- Allow manual cache reset from settings.
- Store ranking reasons in metadata JSON for debugging.
- Never store full video URL if it may contain sensitive tokens; store a hash instead.

---

## 10. Local VLC Companion (`apps/companion`)

Small local app that runs on Windows and exposes an HTTP API. It is the practical bridge between Stremio metadata and VLC playback.

**Host:** `127.0.0.1:47583`

### Endpoints

| Endpoint      | Method | Purpose                                          |
|---------------|--------|--------------------------------------------------|
| /health       | GET    | Check if companion is running                    |
| /play         | POST   | Find subtitle and launch VLC                     |
| /search       | POST   | Return ranked subtitles without launching VLC    |
| /download     | POST   | Download a selected subtitle                     |
| /settings     | GET    | Read local settings                              |
| /settings     | POST   | Update settings                                  |
| /logs/recent  | GET    | Return recent non-sensitive troubleshooting logs |

### POST /play input

```json
{
  "videoUrl": "https://example/video-or-stream-url",
  "type": "series",
  "title": "Breaking Bad",
  "originalTitle": "Breaking Bad",
  "year": 2008,
  "imdbId": "tt0903747",
  "tmdbId": "1396",
  "season": 1,
  "episode": 2,
  "filename": "Breaking.Bad.S01E02.1080p.WEB-DL.x264-Group.mkv",
  "releaseName": "Breaking.Bad.S01E02.1080p.WEB-DL.x264-Group"
}
```

### /play behavior

1. Validate request; reject non-localhost callers.
2. Validate `videoUrl` protocol against an allowlist (http, https, magnet if enabled, file only in local mode).
3. Convert metadata into `SubtitleSearchInput`.
4. Search providers and rank results.
5. Download the best result or use cache.
6. Normalize to UTF-8 SRT.
7. Find VLC executable path.
8. Launch VLC: `vlc.exe "<videoUrl>" --sub-file="<absoluteSubtitlePath>"`
9. Return provider, score, reasons, subtitle path, and VLC launch status.

### VLC Path Detection Order

1. User setting: `vlcPath`
2. Registry uninstall keys
3. `C:\Program Files\VideoLAN\VLC\vlc.exe`
4. `C:\Program Files (x86)\VideoLAN\VLC\vlc.exe`
5. PATH lookup: `where vlc`
6. Ask user to select `vlc.exe`

---

## 11. Stremio Subtitle Addon (`apps/stremio-addon`)

Returns Hebrew subtitle objects for Stremio's internal player. Reuses the same core package.

### Routes

```
GET /manifest.json
GET /subtitles/:type/:id.json
GET /subtitle/:provider/:subtitleId.srt
GET /configure
```

### Manifest

```json
{
  "id": "com.hebsub.bridge",
  "version": "0.1.0",
  "name": "HebSub Bridge",
  "description": "Hebrew subtitles for Stremio, powered by HebSub Core",
  "resources": ["subtitles"],
  "types": ["movie", "series"],
  "idPrefixes": ["tt"],
  "catalogs": []
}
```

**Important limitation:** A Stremio subtitle addon does not force every video to open in VLC. It solves subtitles for the Stremio internal player. The VLC automation requires the companion app and optionally the stream bridge.

---

## 12. Stremio VLC Stream Bridge (Phase 4)

Exposes a special stream item titled **"VLC + Hebrew Subs"** in Stremio's stream list. When selected, it sends the video URL and metadata to the local companion, which searches, downloads, and launches VLC.

**Open technical question:** If Stremio blocks localhost links, the fallback is a custom Windows protocol handler: `hebsub://play?videoUrl=...&imdbId=tt0903747&season=1&episode=2`

---

## 13. Security Requirements

- Bind companion only to `127.0.0.1`, never `0.0.0.0` by default.
- Reject requests from non-local addresses.
- Validate `videoUrl` protocol against an allowlist.
- **Never build shell commands by string concatenation. Use process spawning with argument arrays.**
- Sanitize filenames and cache paths.
- Do not log tokens embedded in stream URLs.
- Store API keys in local user settings; never send them to unrelated services.

---

## 14. Settings Schema

```json
{
  "vlcPath": "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
  "language": "heb",
  "preferredProviders": ["subdl", "opensubtitles", "local"],
  "allowHearingImpaired": false,
  "autoLaunchVlc": true,
  "cacheEnabled": true,
  "cacheTtlDays": 180,
  "subdlApiKey": "",
  "opensubtitlesApiKey": "",
  "localSubtitleFolders": [],
  "logLevel": "info"
}
```

---

## 15. Implementation Phases

| Phase | Name                    | Deliverable                                | Success criteria                                 |
|-------|-------------------------|--------------------------------------------|--------------------------------------------------|
| 1     | Core MVP                | Core pkg: SubDL, ranking, download, UTF-8  | CLI finds and saves Hebrew subtitle for movie/episode |
| 2     | VLC Companion           | Local server with /play and VLC launcher   | POST /play opens VLC with subtitle               |
| 3     | Stremio Subtitle Addon  | Manifest and subtitles route               | Stremio internal player shows Hebrew subtitles   |
| 4     | Stream Bridge           | "VLC + Hebrew Subs" stream option          | Selecting stream opens companion flow            |
| 5     | Hebrew community providers | Wizdom/Ktuvit adapters if appropriate   | More Hebrew coverage without breaking core       |
| 6     | VLC Lua Extension       | Optional VLC menu item                     | Local VLC files can request Hebrew subtitles     |
| 7     | Installer               | Windows installer or portable exe          | Non-developer setup in minutes                   |

---

## 16. Testing Plan

### Unit tests
- Filename parser: movies, series, Hebrew titles, dots/spaces, release groups.
- Ranking: exact match, wrong episode penalty, wrong year penalty, hearing impaired preference.
- Provider adapters: mocked API responses and error cases.
- Encoding normalization: Windows-1255, UTF-8 BOM, malformed Hebrew subtitles.
- Cache keys: movie, series, file hash fallback.

### Integration tests
- Fake provider returns multiple subtitle candidates and ranker chooses best.
- Companion /play launches a mock VLC executable with expected args.
- Stremio manifest validates and subtitles route returns expected format.
- No provider available returns useful error, not crash.
- Network timeout on one provider does not block other providers.

---

## 17. Error Handling

| Case                  | User-facing message                                        | Technical action                         |
|-----------------------|------------------------------------------------------------|------------------------------------------|
| No subtitles found    | No Hebrew subtitle found for this release. Try another stream or manual search. | 404-like result with search details |
| VLC not found         | VLC was not found. Select vlc.exe in settings.             | Open settings page                       |
| Provider API key missing | Provider needs an API key. Add it in settings.          | Skip provider or show setup link         |
| Provider timeout      | One subtitle source timed out. Tried the next source.      | Continue with other providers            |
| Wrong subtitle        | Choose a different subtitle from the ranked results.        | Expose /search results and manual pick   |
| Companion unavailable | HebSub Companion is not running.                           | Show install/start instructions          |

---

## 18. Observability

### What to log
- Request ID, media type, title, year, IMDb ID, season, episode.
- Providers queried and response counts.
- Ranking winner and reasons.
- Cache hit or miss.
- VLC path and launch result.
- Errors without secrets.

### What NOT to log
- Full signed stream URLs with tokens.
- API keys, cookies, passwords, authorization headers.
- Full local file paths if privacy mode is enabled.

---

## 19. Tooling Stack

| Concern         | Choice                        | Reason                                          |
|-----------------|-------------------------------|-------------------------------------------------|
| Language        | TypeScript                    | Type safety for provider interfaces             |
| Package manager | pnpm + workspaces             | Fast installs, strict hoisting, disk efficient  |
| Build system    | Turborepo                     | Incremental builds, task caching across packages|
| Testing         | Vitest                        | Fast, native ESM, TypeScript-first              |
| HTTP server     | Fastify                       | Secure defaults, schema validation, low overhead|
| Linting         | ESLint + Prettier             | Consistent code style                           |
| Git hooks       | simple-git-hooks + lint-staged| Enforce quality on commit                       |

---

## 20. Acceptance Criteria

- Given a movie IMDb ID and video URL, `/play` opens VLC with a Hebrew subtitle file.
- Given a series IMDb ID, season, episode, and video URL, `/play` finds the correct episode subtitle.
- If the first provider fails, the system tries the next.
- If no subtitles are found, the user receives a clear message and VLC can still open without subtitles.
- The Stremio subtitle addon returns valid subtitle objects with `lang=heb`.
- The companion does not expose a network server beyond localhost.
- The app does not log secrets or signed stream URLs.
- A non-developer can follow the README to run the MVP on Windows.

---

## 21. Reference Links

- Stremio Addon SDK: https://github.com/Stremio/stremio-addon-sdk
- Stremio subtitle response docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/subtitles.md
- SubDL API docs: https://subdl.com/api-doc
- OpenSubtitles VLSub project: https://github.com/opensubtitles/vlsub-opensubtitles-com
- Ktuvit Stremio addon reference: https://github.com/maormagori/ktuvit-stremio
