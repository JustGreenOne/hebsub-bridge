#!/usr/bin/env node
import {
  HebSubEngine,
  SubDLProvider,
  OpenSubtitlesProvider,
  LocalFolderProvider,
} from '@hebsub/core';
import type { SubtitleSearchInput } from '@hebsub/core';

export class ParseArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseArgsError';
  }
}

/**
 * Parse CLI flag args (the portion after the subcommand) into a SubtitleSearchInput.
 * Throws ParseArgsError with a helpful message if required flags are missing.
 *
 * Example input: ['--imdb', 'tt0903747', '--type', 'movie', '--year', '2008']
 */
export function parseArgs(args: string[]): SubtitleSearchInput {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      flags[arg.slice(2)] = args[i + 1];
      i++;
    }
  }

  if (!flags['imdb']) {
    throw new ParseArgsError(
      'Missing required flag: --imdb\n' +
        'Usage: hebsub find --imdb <tt-id> --type movie|series [--year N] [--season N] [--episode N]',
    );
  }

  const rawType = flags['type'];
  if (rawType !== undefined && rawType !== 'movie' && rawType !== 'series') {
    throw new ParseArgsError(
      `Invalid --type value "${rawType}". Must be "movie" or "series".`,
    );
  }

  const type: 'movie' | 'series' = (rawType as 'movie' | 'series') ?? 'movie';

  return {
    type,
    language: 'heb',
    imdbId: flags['imdb'],
    year: flags['year'] !== undefined ? parseInt(flags['year'], 10) : undefined,
    season: flags['season'] !== undefined ? parseInt(flags['season'], 10) : undefined,
    episode: flags['episode'] !== undefined ? parseInt(flags['episode'], 10) : undefined,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;

  if (command !== 'find') {
    console.error(
      'Usage: hebsub find --imdb <tt-id> --type movie|series [--year N] [--season N] [--episode N]',
    );
    console.error('       Set SUBDL_API_KEY and/or OS_API_KEY env vars to enable remote providers.');
    process.exit(1);
  }

  let input: SubtitleSearchInput;
  try {
    input = parseArgs(rest);
  } catch (e) {
    if (e instanceof ParseArgsError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  const subdlKey = process.env['SUBDL_API_KEY'] ?? '';
  const osKey = process.env['OS_API_KEY'] ?? '';

  const providers = [
    ...(subdlKey ? [new SubDLProvider(subdlKey)] : []),
    ...(osKey ? [new OpenSubtitlesProvider(osKey)] : []),
    new LocalFolderProvider([]),
  ];

  const engine = new HebSubEngine();

  try {
    const result = await engine.findSubtitle(input, providers);
    if (result === null) {
      console.error('No subtitles found.');
      process.exit(1);
    }
    console.log(result.normalizedPath);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

// Only run when executed directly (not when imported in tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
