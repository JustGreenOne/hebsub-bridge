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
