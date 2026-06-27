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
