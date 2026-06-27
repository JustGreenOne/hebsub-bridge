import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadSettings, saveSettings, defaultSettings } from '../src/settings/store';

describe('settings store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'hebsub-test-'));
    process.env['HEBSUB_SETTINGS_DIR'] = tmpDir;
  });

  afterEach(() => {
    delete process.env['HEBSUB_SETTINGS_DIR'];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadSettings returns default settings when file does not exist', () => {
    const settings = loadSettings();
    const defaults = defaultSettings();
    expect(settings.language).toBe('heb');
    expect(settings.allowHearingImpaired).toBe(false);
    expect(settings.autoLaunchVlc).toBe(true);
    expect(settings.cacheEnabled).toBe(true);
    expect(settings.cacheTtlDays).toBe(180);
    expect(settings.logLevel).toBe('info');
    expect(settings.preferredProviders).toEqual(defaults.preferredProviders);
  });

  it('saveSettings and loadSettings round-trip correctly', () => {
    saveSettings({ logLevel: 'debug', cacheTtlDays: 30, allowHearingImpaired: true });
    const loaded = loadSettings();
    expect(loaded.logLevel).toBe('debug');
    expect(loaded.cacheTtlDays).toBe(30);
    expect(loaded.allowHearingImpaired).toBe(true);
    // Unchanged fields retain defaults
    expect(loaded.language).toBe('heb');
    expect(loaded.cacheEnabled).toBe(true);
    expect(loaded.preferredProviders).toEqual(['subdl', 'opensubtitles', 'local']);
  });
});
