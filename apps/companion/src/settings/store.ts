import fs from 'fs';
import path from 'path';
import os from 'os';
import type { HebSubSettings } from '@hebsub/core';

/**
 * Returns the directory + filename for the settings file.
 * Override via HEBSUB_SETTINGS_DIR env var (used in tests).
 */
export function getSettingsPath(): string {
  const dir = process.env['HEBSUB_SETTINGS_DIR']
    ? process.env['HEBSUB_SETTINGS_DIR']
    : process.platform === 'win32'
      ? path.join(process.env['APPDATA'] || os.homedir(), 'HebSubBridge')
      : path.join(os.homedir(), '.hebsub');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'settings.json');
}

export function defaultSettings(): HebSubSettings {
  return {
    vlcPath:
      process.platform === 'win32'
        ? 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe'
        : '/usr/bin/vlc',
    language: 'heb',
    preferredProviders: ['subdl', 'opensubtitles', 'local'],
    allowHearingImpaired: false,
    autoLaunchVlc: true,
    cacheEnabled: true,
    cacheTtlDays: 180,
    subdlApiKey: '',
    opensubtitlesApiKey: '',
    localSubtitleFolders: [],
    logLevel: 'info',
  };
}

export function loadSettings(): HebSubSettings {
  const p = getSettingsPath();
  if (!fs.existsSync(p)) return defaultSettings();
  try {
    const stored = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<HebSubSettings>;
    return { ...defaultSettings(), ...stored };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(partial: Partial<HebSubSettings>): HebSubSettings {
  const current = loadSettings();
  const updated: HebSubSettings = { ...current, ...partial };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
