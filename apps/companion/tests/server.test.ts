import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
