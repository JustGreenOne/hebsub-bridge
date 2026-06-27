import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { buildServer } from '../src/server';
import { defaultSettings } from '../src/settings/store';

describe('companion server', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    app = await buildServer(defaultSettings());
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok' });
  });

  it('GET /settings returns default settings shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('vlcPath');
    expect(body).toHaveProperty('language', 'heb');
    expect(body).toHaveProperty('preferredProviders');
    expect(Array.isArray(body.preferredProviders)).toBe(true);
  });

  it('rejects requests from non-localhost origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/play',
      headers: { 'X-Forwarded-For': '192.168.1.100' },
      payload: JSON.stringify({ videoUrl: 'https://example.com/video.mkv', type: 'movie' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /settings does NOT include API keys in response', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).not.toHaveProperty('subdlApiKey');
    expect(body).not.toHaveProperty('opensubtitlesApiKey');
  });

  it('POST /settings updates a field and GET /settings reflects it', async () => {
    // Use an isolated temp dir so we don't touch the real settings file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebsub-test-'));
    const originalDir = process.env['HEBSUB_SETTINGS_DIR'];
    process.env['HEBSUB_SETTINGS_DIR'] = tmpDir;

    try {
      const postRes = await app.inject({
        method: 'POST',
        url: '/settings',
        payload: JSON.stringify({ allowHearingImpaired: true }),
        headers: { 'content-type': 'application/json' },
      });
      expect(postRes.statusCode).toBe(200);
      expect(JSON.parse(postRes.body)).toEqual({ ok: true });

      const getRes = await app.inject({ method: 'GET', url: '/settings' });
      expect(getRes.statusCode).toBe(200);
      const body = JSON.parse(getRes.body);
      expect(body).toHaveProperty('allowHearingImpaired', true);
    } finally {
      if (originalDir === undefined) {
        delete process.env['HEBSUB_SETTINGS_DIR'];
      } else {
        process.env['HEBSUB_SETTINGS_DIR'] = originalDir;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /logs/recent returns an array under the logs key', async () => {
    const res = await app.inject({ method: 'GET', url: '/logs/recent' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('logs');
    expect(Array.isArray(body.logs)).toBe(true);
  });
});
