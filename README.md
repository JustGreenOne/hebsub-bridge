# HebSub Bridge

Automatically find Hebrew subtitles and open videos in VLC — from Stremio or from the command line.

## How it works

1. You trigger a video (from Stremio or the CLI).
2. HebSub Bridge searches subtitle providers (SubDL, OpenSubtitles, or a local folder) for the best Hebrew subtitle.
3. The companion app launches VLC with the subtitle pre-loaded.

```
Stremio  →  Companion (127.0.0.1:47583)  →  HebSub Core  →  VLC + subtitle
```

---

## Requirements

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 18 | Use [nvm](https://github.com/nvm-sh/nvm) on Linux/Mac or [nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows |
| pnpm | 8 | `npm install -g pnpm` |
| VLC | any | [videolan.org](https://www.videolan.org/vlc/) |
| Git | any | To clone the repo |

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/JustGreenOne/hebsub-bridge.git
cd hebsub-bridge
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Get API keys (free)

**SubDL** (recommended — best Hebrew coverage):
1. Go to [subdl.com](https://subdl.com) and create a free account.
2. Go to your profile → API Key.
3. Copy the key.

**OpenSubtitles** (optional, for extra coverage):
1. Go to [opensubtitles.com](https://www.opensubtitles.com) and create a free account.
2. Go to [consumers.opensubtitles.com](https://www.opensubtitles.com/en/consumers) and create an app to get an API key.

### 4. Configure settings

Run the companion once to create the default settings file, then edit it:

**Windows** — settings file is at:
```
%APPDATA%\HebSubBridge\settings.json
```

**Linux / Mac** — settings file is at:
```
~/.hebsub/settings.json
```

Edit the file and fill in your keys:

```json
{
  "vlcPath": "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
  "language": "heb",
  "preferredProviders": ["subdl", "opensubtitles", "local"],
  "allowHearingImpaired": false,
  "autoLaunchVlc": true,
  "cacheEnabled": true,
  "cacheTtlDays": 180,
  "subdlApiKey": "YOUR_SUBDL_KEY_HERE",
  "opensubtitlesApiKey": "YOUR_OS_KEY_HERE",
  "localSubtitleFolders": [],
  "logLevel": "info"
}
```

On Linux/Mac, `vlcPath` is not needed — VLC will be found automatically via `which vlc`.

---

## Running the companion server

The companion is a small local server that handles subtitle search and VLC launching.

```bash
# From the repo root
node apps/companion/src/index.ts
```

Or with pnpm:

```bash
pnpm --filter @hebsub/companion start
```

The server listens on `http://127.0.0.1:47583`. It only accepts requests from your own machine.

To verify it's running:

```bash
curl http://127.0.0.1:47583/health
# → {"status":"ok","version":"0.1.0"}
```

---

## Using the CLI

Find and download a Hebrew subtitle from the command line:

```bash
# Movie (by IMDb ID)
SUBDL_API_KEY=your_key node apps/cli/src/index.ts find --imdb tt0111161 --type movie

# TV episode
SUBDL_API_KEY=your_key node apps/cli/src/index.ts find --imdb tt0903747 --type series --season 1 --episode 2
```

On success it prints the path to the downloaded subtitle file.

---

## Using the companion HTTP API

Once the companion is running, other apps (Stremio addons, scripts, etc.) can call it:

### Open a video in VLC with Hebrew subtitles

```bash
curl -X POST http://127.0.0.1:47583/play \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/video.mkv",
    "type": "series",
    "imdbId": "tt0903747",
    "season": 1,
    "episode": 2
  }'
```

Response:
```json
{
  "success": true,
  "subtitle": {
    "providerId": "subdl",
    "normalizedPath": "/tmp/hebsub-...",
    "score": 210
  },
  "vlcPid": 12345
}
```

### Search for subtitles without launching VLC

```bash
curl -X POST http://127.0.0.1:47583/search \
  -H "Content-Type: application/json" \
  -d '{ "type": "movie", "imdbId": "tt0111161" }'
```

### Download a specific subtitle

```bash
curl -X POST http://127.0.0.1:47583/download \
  -H "Content-Type: application/json" \
  -d '{ "providerId": "subdl", "subtitleId": "123456", "type": "movie" }'
```

---

## Auto-start on Windows (optional)

To have the companion start automatically with Windows:

1. Create a shortcut to `node apps/companion/src/index.ts` (or a `.bat` file that runs it).
2. Press `Win + R`, type `shell:startup`, press Enter.
3. Drop the shortcut into that folder.

---

## Stremio integration (coming in Phase 3)

The Stremio subtitle addon (`apps/stremio-addon`) is planned for Phase 3. Once built, you'll be able to install it in Stremio directly and get Hebrew subtitles in the internal player without needing the companion.

The companion already exposes the `/play` endpoint that a stream bridge can call — Phase 4 will wire a "VLC + Hebrew Subs" stream option into Stremio.

---

## Project structure

```
hebsub-bridge/
  packages/
    core/          ← subtitle search engine (providers, ranker, cache, normalizer)
  apps/
    companion/     ← local HTTP server (127.0.0.1:47583), VLC launcher
    cli/           ← command-line interface
  docs/
    superpowers/   ← design spec and implementation plans
```

---

## Troubleshooting

**VLC not found**
Set `vlcPath` in settings to the full path of `vlc.exe` (Windows) or `vlc` binary.

**No subtitles found**
- Check your API key is correct in settings.
- Try a different provider order in `preferredProviders`.
- Make sure the IMDb ID is correct (format: `tt1234567`).

**Companion not starting**
- Make sure Node 18+ is installed: `node --version`
- Make sure dependencies are installed: `pnpm install`

**Subtitle encoding looks wrong in VLC**
The normalizer converts Windows-1255 Hebrew files to UTF-8 automatically. If text still looks wrong, check VLC → Tools → Preferences → Subtitles/OSD → Default encoding → set to UTF-8.

---

## Running tests

```bash
# All packages
pnpm test

# Core only
pnpm --filter @hebsub/core test

# Companion only
pnpm --filter @hebsub/companion test
```
