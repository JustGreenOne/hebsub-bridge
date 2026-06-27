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

  if (input.imdbId && r.imdbId) {
    if (r.imdbId === input.imdbId) {
      s += 120; reasons.push('exact imdbId match');
    } else {
      s -= 70; warnings.push('wrong imdbId');
    }
  }
  if (input.tmdbId && r.tmdbId) {
    if (r.tmdbId === input.tmdbId) {
      s += 100; reasons.push('exact tmdbId match');
    } else {
      s -= 70; warnings.push('wrong tmdbId');
    }
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
