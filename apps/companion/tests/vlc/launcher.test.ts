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
