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
  // 4. PATH lookup — use spawnSync to avoid shell injection via exec()
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
