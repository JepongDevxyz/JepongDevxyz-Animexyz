'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const AnimeXYZ = require('../index.js');
const { AnimeXYZError, normalizePlaybackResult } = require('../index.js');

test('CommonJS exports AnimeXYZ and AnimeXYZError', () => {
  assert.equal(typeof AnimeXYZ, 'function');
  assert.equal(typeof AnimeXYZError, 'function');
});

test('constructor rejects non-object options', () => {
  assert.throws(() => new AnimeXYZ(null), /options must be an object/);
});

test('constructor rejects invalid fetch', () => {
  assert.throws(() => new AnimeXYZ({ fetch: 123 }), /fetch must be a function/);
});

test('constructor rejects invalid streamProvider', () => {
  assert.throws(() => new AnimeXYZ({ streamProvider: 123 }), /streamProvider must be a function/);
});

test('constructor accepts a custom baseUrl and strips trailing slash', () => {
  const api = new AnimeXYZ({
    baseUrl: 'https://example.test/api/',
    fetch: async () => ({ ok: true, text: async () => '{}' }),
  });
  assert.equal(api.baseUrl, 'https://example.test/api');
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function createRecorder(responseBody = { ok: true }) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse(responseBody);
  };
  return { calls, fetch };
}

test('search builds encoded query and pagination', async () => {
  const recorder = createRecorder({ results: [] });
  const api = new AnimeXYZ({ baseUrl: 'https://example.test/api/v1', fetch: recorder.fetch });
  await api.search('one piece', { page: 2, limit: 10 });
  const url = new URL(recorder.calls[0].url);
  assert.equal(url.pathname, '/api/v1/search');
  assert.equal(url.searchParams.get('q'), 'one piece');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('limit'), '10');
});

test('method routes match the AnimeXYZ contract', async () => {
  const recorder = createRecorder({
    source: 'test-backend',
    type: 'external',
    url: 'https://official.example/watch',
  });
  const api = new AnimeXYZ({ baseUrl: 'https://example.test/api/v1', fetch: recorder.fetch });
  await api.info();
  await api.home({ page: 1 });
  await api.newEpisodes();
  await api.popular();
  await api.fastSearch('nar');
  await api.season('2026fall');
  await api.anime('abc');
  await api.stream('abc', '12');
  const paths = recorder.calls.map(({ url }) => new URL(url).pathname);
  assert.deepEqual(paths, [
    '/api/v1/info', '/api/v1/', '/api/v1/new', '/api/v1/popular',
    '/api/v1/fastsearch', '/api/v1/season/2026fall', '/api/v1/anime/abc', '/api/v1/stream/abc/12',
  ]);
});

test('limit outside 1..100 is rejected', () => {
  const api = new AnimeXYZ({ fetch: async () => jsonResponse({}) });
  assert.throws(() => api.home({ limit: 101 }), /limit must be between 1 and 100/);
});

test('empty query is rejected', () => {
  const api = new AnimeXYZ({ fetch: async () => jsonResponse({}) });
  assert.throws(() => api.search('   '), /query must be a non-empty string/);
});

test('HTTP errors throw AnimeXYZError with status and code', async () => {
  const api = new AnimeXYZ({
    fallback: false,
    fetch: async () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Missing' } }, 404),
  });
  await assert.rejects(
    () => api.anime('missing'),
    (error) => error instanceof AnimeXYZError && error.status === 404 && error.code === 'NOT_FOUND',
  );
});

test('network errors throw AnimeXYZError', async () => {
  const api = new AnimeXYZ({ baseUrl: 'https://example.test/api/v1', fetch: async () => { throw new Error('offline'); } });
  await assert.rejects(
    () => api.info(),
    (error) => error instanceof AnimeXYZError && error.code === 'NETWORK_ERROR',
  );
});

test('non-JSON success body is preserved as text', async () => {
  const api = new AnimeXYZ({
    baseUrl: 'https://example.test/api/v1',
    fetch: async () => ({ ok: true, status: 200, text: async () => 'hello' }),
  });
  assert.equal(await api.info(), 'hello');
});

test('custom headers merge with Accept header', async () => {
  const recorder = createRecorder({ ok: true });
  const api = new AnimeXYZ({ baseUrl: 'https://example.test/api/v1', fetch: recorder.fetch, headers: { 'X-App': 'AnimeXYZ' } });
  await api.info({ headers: { 'X-Request': '1' } });
  assert.equal(recorder.calls[0].options.headers.Accept, 'application/json');
  assert.equal(recorder.calls[0].options.headers['X-App'], 'AnimeXYZ');
  assert.equal(recorder.calls[0].options.headers['X-Request'], '1');
});

test('invalid timeout is rejected', () => {
  assert.throws(() => new AnimeXYZ({ timeout: -1 }), /timeout must be a non-negative number or false/);
});

test('default Niheaven backend maps AnimeXYZ methods and keeps Jikan as fallback', async () => {
  const recorder = createRecorder({
    source: 'test-backend',
    type: 'external',
    url: 'https://official.example/watch',
  });
  const api = new AnimeXYZ({ fetch: recorder.fetch });
  const info = await api.info();
  assert.equal(info.name, 'AnimeXYZ');
  await api.home({ page: 1, limit: 10 });
  await api.newEpisodes({ page: 1, limit: 10 });
  await api.popular({ page: 1, limit: 10 });
  await api.search('naruto', { page: 1, limit: 10 });
  await api.fastSearch('nar', { limit: 5 });
  await api.season('2026fall', { page: 1, limit: 10 });
  await api.anime('20');
  await api.stream('20', 1);
  const paths = recorder.calls.map(({ url }) => new URL(url).pathname);
  assert.deepEqual(paths, [
    '/api/v1/info',
    '/api/v1/',
    '/api/v1/new',
    '/api/v1/popular',
    '/api/v1/search',
    '/api/v1/fastsearch',
    '/api/v1/season/2026fall',
    '/api/v1/anime/20',
    '/api/v1/stream/20/1',
  ]);
});

test('info uses a local diagnostic fallback because Jikan has no info route', async () => {
  const calls = [];
  const api = new AnimeXYZ({
    fetch: async (url) => {
      calls.push(String(url));
      return jsonResponse({ error: { code: 'UPSTREAM_DOWN', message: 'Niheaven unavailable' } }, 503);
    },
  });

  const result = await api.info();

  assert.equal(result.source, 'local');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/nimeheaven\.vercel\.app\/api\/v1\/info$/);
});

test('uses Niheaven as the primary metadata provider and keeps provider IDs separate', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ results: [{ id: 'nh-one-piece', title: 'One Piece' }] });
  };
  const api = new AnimeXYZ({ fetch });

  const result = await api.search('one piece', { page: 1, limit: 10 });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/nimeheaven\.vercel\.app\/api\/v1\/search/);
  assert.equal(result.source, 'niheaven');
  assert.equal(result.results[0].niheavenId, 'nh-one-piece');
  assert.equal(result.results[0].malId, null);
  assert.deepEqual(result.results[0].ids, { niheaven: 'nh-one-piece', mal: null });
});

test('search falls back to Jikan when Niheaven returns unrelated results', async () => {
  const calls = [];
  const fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.startsWith('https://nimeheaven.vercel.app/')) {
      return jsonResponse({
        query: 'naruto',
        results: [{ id: 'nh-unrelated', title: 'Unrelated Show' }],
      });
    }
    return jsonResponse({ data: [{ mal_id: 20, title: 'Naruto' }] });
  };
  const api = new AnimeXYZ({ fetch });

  const result = await api.search('naruto', { limit: 1 });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /^https:\/\/nimeheaven\.vercel\.app\/api\/v1\/search/);
  assert.match(calls[1], /^https:\/\/api\.jikan\.moe\/v4\/anime/);
  assert.equal(new URL(calls[1]).searchParams.get('sfw'), 'true');
  assert.equal(result.source, 'jikan');
  assert.equal(result.data[0].title, 'Naruto');
  assert.equal(result.data[0].malId, 20);
});

test('fastSearch keeps a relevant partial-title result from Niheaven', async () => {
  const recorder = createRecorder({ results: [{ id: 'nh-naruto', title: 'Naruto Shippuden' }] });
  const api = new AnimeXYZ({ fetch: recorder.fetch });

  const result = await api.fastSearch('nar');

  assert.equal(recorder.calls.length, 1);
  assert.equal(result.source, 'niheaven');
  assert.equal(result.results[0].niheavenId, 'nh-naruto');
});

test('falls back to Jikan metadata after a Niheaven failure', async () => {
  const calls = [];
  const fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.startsWith('https://nimeheaven.vercel.app/')) {
      return jsonResponse({ error: { code: 'UPSTREAM_DOWN', message: 'Niheaven unavailable' } }, 503);
    }
    return jsonResponse({ data: { mal_id: 20, title: 'Naruto' } });
  };
  const api = new AnimeXYZ({ fetch });

  const result = await api.anime({ niheavenId: 'nh-naruto', malId: 20 });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /^https:\/\/nimeheaven\.vercel\.app\/api\/v1\/anime/);
  assert.match(calls[1], /^https:\/\/api\.jikan\.moe\/v4\/anime/);
  assert.equal(result.source, 'jikan');
  assert.equal(result.data.niheavenId, null);
  assert.equal(result.data.malId, 20);
  assert.deepEqual(result.data.ids, { niheaven: null, mal: 20 });
  assert.deepEqual(result.requestedIds, { niheaven: 'nh-naruto', mal: 20 });
});

test('does not send a Niheaven ID to Jikan when no MAL ID is available', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ error: { code: 'UPSTREAM_DOWN', message: 'Niheaven unavailable' } }, 503);
  };
  const api = new AnimeXYZ({ fetch });

  await assert.rejects(
    () => api.anime({ niheavenId: 'nh-naruto' }),
    (error) => error instanceof AnimeXYZError
      && error.code === 'FALLBACK_FAILED'
      && error.details.fallback.code === 'FALLBACK_UNAVAILABLE',
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/nimeheaven\.vercel\.app\/api\/v1\/anime\/nh-naruto$/);
});

test('a MAL identifier uses Jikan directly and does not become a Niheaven identifier', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ data: { mal_id: 20, title: 'Naruto' } });
  };
  const api = new AnimeXYZ({ fetch });

  const result = await api.anime({ malId: 20 });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/api\.jikan\.moe\/v4\/anime\/20\/full$/);
  assert.equal(result.source, 'jikan');
  assert.equal(result.data.malId, 20);
  assert.equal(result.data.niheavenId, null);
});

test('MAL identifiers must be positive safe integers', () => {
  const api = new AnimeXYZ({ fetch: async () => jsonResponse({}) });
  assert.throws(() => api.anime({ malId: 0 }), /malId must be a positive integer/);
  assert.throws(() => api.anime({ malId: '000' }), /malId must be a positive integer/);
  assert.throws(() => api.anime({ malId: 'not-a-number' }), /malId must be a positive integer/);
});

test('cancellation stops fallback and reports ABORTED', async () => {
  const controller = new AbortController();
  const calls = [];
  const fetch = (url, options) => {
    calls.push(String(url));
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
    });
  };
  const api = new AnimeXYZ({ fetch });
  const pending = api.search('naruto', { signal: controller.signal });
  controller.abort();

  await assert.rejects(
    pending,
    (error) => error instanceof AnimeXYZError && error.code === 'ABORTED',
  );
  assert.equal(calls.length, 1);
});

test('request timeout reports TIMEOUT', async () => {
  const fetch = (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name: 'AbortError' })), { once: true });
  });
  const api = new AnimeXYZ({
    baseUrl: 'https://example.test/api/v1',
    timeout: 5,
    fetch,
  });

  await assert.rejects(
    () => api.info(),
    (error) => error instanceof AnimeXYZError && error.code === 'TIMEOUT',
  );
});

test('request timeout is enforced when fetch ignores AbortSignal', async () => {
  const api = new AnimeXYZ({
    baseUrl: 'https://example.test/api/v1',
    timeout: 5,
    fetch: async () => new Promise(() => {}),
  });

  await assert.rejects(
    () => api.info(),
    (error) => error instanceof AnimeXYZError && error.code === 'TIMEOUT',
  );
});

test('streamProvider receives normalized identifiers and client', async () => {
  let received;
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({}),
    streamProvider: async (context) => {
      received = context;
      return { watchUrl: 'https://legal.example/watch/1' };
    },
  });
  const result = await api.stream(' abc ', 12);
  assert.deepEqual(result, {
    playable: false,
    source: 'stream-provider',
    playback: null,
    fallback: {
      type: 'external',
      url: 'https://legal.example/watch/1',
      label: 'Watch on official provider',
    },
  });
  assert.equal(received.id, 'abc');
  assert.equal(received.episode, '12');
  assert.equal(received.client, api);
});

test('normalizes an authorized MP4 provider response', async () => {
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({}),
    streamProvider: async () => ({ source: 'licensed', type: 'mp4', url: 'https://media.example/ep1.mp4' }),
  });
  assert.deepEqual(await api.stream('show', 1), {
    playable: true,
    source: 'licensed',
    playback: { type: 'mp4', url: 'https://media.example/ep1.mp4', title: null },
    fallback: null,
  });
});

test('normalizes an authorized HLS provider response', async () => {
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({}),
    streamProvider: async () => ({
      source: 'licensed',
      type: 'hls',
      url: 'https://media.example/ep1.m3u8',
      title: 'Episode 1',
    }),
  });
  assert.deepEqual(await api.stream('show', 1), {
    playable: true,
    source: 'licensed',
    playback: { type: 'hls', url: 'https://media.example/ep1.m3u8', title: 'Episode 1' },
    fallback: null,
  });
});

test('normalizes official external and trailer responses as fallbacks', () => {
  assert.deepEqual(normalizePlaybackResult({
    source: 'metadata',
    type: 'external',
    url: 'https://official.example/title',
    label: 'Watch on official provider',
  }), {
    playable: false,
    source: 'metadata',
    playback: null,
    fallback: {
      type: 'external',
      url: 'https://official.example/title',
      label: 'Watch on official provider',
    },
  });
  assert.deepEqual(normalizePlaybackResult({
    source: 'metadata',
    type: 'trailer',
    url: 'https://official.example/trailer',
  }), {
    playable: false,
    source: 'metadata',
    playback: null,
    fallback: {
      type: 'trailer',
      url: 'https://official.example/trailer',
      label: 'Watch trailer',
    },
  });
});

test('normalizes embeds from an allowlisted host or its subdomains', async () => {
  const api = new AnimeXYZ({
    allowedEmbedHosts: ['PLAYER.EXAMPLE'],
    fetch: async () => jsonResponse({}),
    streamProvider: async () => ({
      source: 'licensed',
      type: 'embed',
      url: 'https://cdn.player.example/embed/episode-1',
    }),
  });
  assert.deepEqual(await api.stream('show', 1), {
    playable: true,
    source: 'licensed',
    playback: { type: 'embed', url: 'https://cdn.player.example/embed/episode-1', title: null },
    fallback: null,
  });
  assert.equal(normalizePlaybackResult(
    { source: 'licensed', type: 'embed', url: 'https://player.example/embed/episode-1' },
    { allowedEmbedHosts: ['player.example'] },
  ).playable, true);
});

test('rejects non-HTTPS playback URLs with INVALID_STREAM_RESPONSE', () => {
  for (const url of [
    'http://media.example/ep1.mp4',
    'javascript:alert(1)',
    'data:video/mp4;base64,AAAA',
    'blob:https://media.example/id',
    'file:///episode.mp4',
  ]) {
    assert.throws(
      () => normalizePlaybackResult({ source: 'licensed', type: 'mp4', url }),
      (error) => error instanceof AnimeXYZError && error.code === 'INVALID_STREAM_RESPONSE',
    );
  }
});

test('rejects unknown stream types with INVALID_STREAM_RESPONSE', () => {
  assert.throws(
    () => normalizePlaybackResult({ source: 'licensed', type: 'dash', url: 'https://media.example/manifest.mpd' }),
    (error) => error instanceof AnimeXYZError && error.code === 'INVALID_STREAM_RESPONSE',
  );
});

test('rejects playback URLs containing credentials with INVALID_STREAM_RESPONSE', () => {
  assert.throws(
    () => normalizePlaybackResult({ source: 'licensed', type: 'mp4', url: 'https://user:secret@media.example/ep1.mp4' }),
    (error) => error instanceof AnimeXYZError && error.code === 'INVALID_STREAM_RESPONSE',
  );
});

test('rejects malformed stream responses with INVALID_STREAM_RESPONSE', () => {
  for (const value of ['https://media.example/ep1.mp4', [], new Date(0), { type: 'mp4', url: 'not a URL' }]) {
    assert.throws(
      () => normalizePlaybackResult(value),
      (error) => error instanceof AnimeXYZError && error.code === 'INVALID_STREAM_RESPONSE',
    );
  }
});

test('rejects unapproved embed hosts with INVALID_STREAM_RESPONSE', () => {
  for (const url of [
    'https://player.example/embed/1',
    'https://evilplayer.example/embed/1',
    'https://evilsafe.player.example/embed/1',
  ]) {
    assert.throws(
      () => normalizePlaybackResult(
        { source: 'licensed', type: 'embed', url },
        { allowedEmbedHosts: ['safe.player.example'] },
      ),
      (error) => error instanceof AnimeXYZError && error.code === 'INVALID_STREAM_RESPONSE',
    );
  }
});

test('reports STREAM_UNAVAILABLE when no authorized source or fallback exists', () => {
  for (const value of [null, undefined, {}]) {
    assert.throws(
      () => normalizePlaybackResult(value),
      (error) => error instanceof AnimeXYZError && error.code === 'STREAM_UNAVAILABLE',
    );
  }
});

test('constructor rejects malformed embed host allowlists', () => {
  for (const allowedEmbedHosts of ['player.example', [123], ['https://player.example/embed']]) {
    assert.throws(
      () => new AnimeXYZ({ fetch: async () => jsonResponse({}), allowedEmbedHosts }),
      /allowedEmbedHosts/,
    );
  }
});

test('custom backend stream normalizes a valid authorized response', async () => {
  const api = new AnimeXYZ({
    baseUrl: 'https://api.example/v1',
    fetch: async () => jsonResponse({
      source: 'licensed-network',
      type: 'mp4',
      url: 'https://media.example/network-episode.mp4',
    }),
  });

  assert.deepEqual(await api.stream('show', 1), {
    playable: true,
    source: 'licensed-network',
    playback: {
      type: 'mp4',
      url: 'https://media.example/network-episode.mp4',
      title: null,
    },
    fallback: null,
  });
});

test('custom backend stream rejects unsafe HTTP and unapproved embed responses', async () => {
  for (const body of [
    { source: 'licensed-network', type: 'mp4', url: 'http://media.example/episode.mp4' },
    { source: 'licensed-network', type: 'embed', url: 'https://unapproved.player.example/embed/1' },
  ]) {
    const api = new AnimeXYZ({
      baseUrl: 'https://api.example/v1',
      allowedEmbedHosts: ['safe.player.example'],
      fetch: async () => jsonResponse(body),
    });

    await assert.rejects(
      () => api.stream('show', 1),
      (error) => error instanceof AnimeXYZError && error.code === 'INVALID_STREAM_RESPONSE',
    );
  }
});

test('default Niheaven stream rejects direct playable sources without explicit authorization', async () => {
  for (const body of [
    { source: 'niheaven', type: 'mp4', url: 'https://media.example/episode.mp4' },
    { source: 'niheaven', type: 'hls', url: 'https://media.example/episode.m3u8' },
    { source: 'niheaven', type: 'embed', url: 'https://safe.player.example/embed/1' },
    { source: 'niheaven', type: 'mp4', url: 'http://media.example/episode.mp4' },
  ]) {
    const api = new AnimeXYZ({
      allowedEmbedHosts: ['safe.player.example'],
      fetch: async () => jsonResponse(body),
    });

    await assert.rejects(
      () => api.stream('show', 1),
      (error) => error instanceof AnimeXYZError && error.code === 'STREAM_UNAVAILABLE',
    );
  }
});

test('default Niheaven stream normalizes official external and trailer fallbacks', async () => {
  for (const [body, expected] of [
    [
      { source: 'niheaven', type: 'external', url: 'https://official.example/watch', label: 'Official site' },
      { type: 'external', url: 'https://official.example/watch', label: 'Official site' },
    ],
    [
      { source: 'niheaven', type: 'trailer', url: 'https://official.example/trailer' },
      { type: 'trailer', url: 'https://official.example/trailer', label: 'Watch trailer' },
    ],
  ]) {
    const api = new AnimeXYZ({ fetch: async () => jsonResponse(body) });
    assert.deepEqual(await api.stream('show', 1), {
      playable: false,
      source: 'niheaven',
      playback: null,
      fallback: expected,
    });
  }
});

test('default Niheaven stream rejects unsafe official fallback URLs', async () => {
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({
      source: 'niheaven',
      type: 'external',
      url: 'http://official.example/watch',
    }),
  });
  await assert.rejects(
    () => api.stream('show', 1),
    (error) => error instanceof AnimeXYZError && error.code === 'INVALID_STREAM_RESPONSE',
  );
});

for (const networkMode of [
  { name: 'custom backend', options: { baseUrl: 'https://api.example/v1' } },
  { name: 'default Niheaven', options: {} },
]) {
  test(`${networkMode.name} stream rejects malformed and empty responses`, async () => {
    for (const [body, expectedCode] of [
      [['not', 'a', 'provider', 'object'], 'INVALID_STREAM_RESPONSE'],
      [{}, 'STREAM_UNAVAILABLE'],
    ]) {
      const api = new AnimeXYZ({
        ...networkMode.options,
        fetch: async () => jsonResponse(body),
      });

      await assert.rejects(
        () => api.stream('show', 1),
        (error) => error instanceof AnimeXYZError && error.code === expectedCode,
      );
    }
  });
}

test('streamProvider failures become STREAM_PROVIDER_ERROR', async () => {
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({}),
    streamProvider: async () => { throw new Error('provider down'); },
  });
  await assert.rejects(
    () => api.stream('abc', 1),
    (error) => error instanceof AnimeXYZError && error.code === 'STREAM_PROVIDER_ERROR',
  );
});

test('streamProvider timeout and cancellation are enforced', async () => {
  const timeoutApi = new AnimeXYZ({
    timeout: 5,
    fetch: async () => jsonResponse({}),
    streamProvider: async () => new Promise(() => {}),
  });
  await assert.rejects(
    () => timeoutApi.stream('abc', 1),
    (error) => error instanceof AnimeXYZError && error.code === 'TIMEOUT',
  );

  const controller = new AbortController();
  const cancelledApi = new AnimeXYZ({
    timeout: false,
    fetch: async () => jsonResponse({}),
    streamProvider: async () => new Promise(() => {}),
  });
  const pending = cancelledApi.stream('abc', 1, { signal: controller.signal });
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error instanceof AnimeXYZError && error.code === 'ABORTED',
  );
});

test('ESM exports playback normalization with the client and error class', async () => {
  const modulePath = path.resolve(__dirname, '../index.mjs');
  const mod = await import(`file://${modulePath}`);
  assert.equal(typeof mod.default, 'function');
  assert.equal(typeof mod.AnimeXYZ, 'function');
  assert.equal(typeof mod.AnimeXYZError, 'function');
  assert.equal(typeof mod.normalizePlaybackResult, 'function');
});

test('website files and required branding exist', () => {
  const root = path.resolve(__dirname, '../website');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

  assert.match(html, /<meta[^>]+name=["']viewport["']/i);
  assert.match(html, /AnimeXYZ/);
  assert.match(html, /\.\/styles\.css/);
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /id=["']poweredToast["']/);
  assert.match(html, /Powered by Jepong Devxyz/);
  assert.match(css, /\.toast/);
  assert.match(css, /@media/);
  assert.match(js, /poweredToast/);
  assert.match(js, /3000/);
});

test('README documents package name, class, backend, and website', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
  assert.match(readme, /animexyz-api/);
  assert.match(readme, /AnimeXYZ/);
  assert.match(readme, /Jikan/);
  assert.match(readme, /streamProvider/);
  assert.match(readme, /website\//);
});

test('GitHub Actions workflow runs install, tests, and package validation', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/test.yml'), 'utf8');
  assert.match(workflow, /node-version:\s*\[18,\s*20,\s*22\]/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run pack:check/);
});
