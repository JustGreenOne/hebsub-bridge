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
