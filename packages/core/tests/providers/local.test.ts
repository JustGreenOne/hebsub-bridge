import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalFolderProvider } from '../../src/providers/local';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-local-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

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
    fs.writeFileSync(
      path.join(tmpDir, 'Breaking.Bad.S01E02.Hebrew.srt'),
      '1\n00:00:01,000 --> 00:00:02,000\nTest\n',
    );
    const p = new LocalFolderProvider([tmpDir]);
    const results = await p.search({ type: 'series', language: 'heb', season: 1, episode: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].format).toBe('srt');
    expect(results[0].providerId).toBe('local');
  });

  it('parses season and episode from filename', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'The.Wire.S03E09.Hebrew.srt'),
      '1\n00:00:01,000 --> 00:00:02,000\nTest\n',
    );
    const p = new LocalFolderProvider([tmpDir]);
    const results = await p.search({ type: 'series', language: 'heb' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].season).toBe(3);
    expect(results[0].episode).toBe(9);
  });

  it('returns empty array when folder does not exist', async () => {
    const p = new LocalFolderProvider(['/nonexistent/path/hebsub-test']);
    const results = await p.search({ type: 'movie', language: 'heb' });
    expect(results).toEqual([]);
  });
});
