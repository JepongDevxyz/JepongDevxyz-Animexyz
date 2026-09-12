'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../website/api/stream/[id]/[episode]');

function responseState() {
  const state = {};
  state.res = {
    status(code) { state.status = code; return this; },
    setHeader(name, value) { (state.headers ||= {})[name] = value; return this; },
    json(body) { state.body = body; return body; },
  };
  return state;
}

test('serves the allowlisted Sintel legal demo as normalized MP4 playback', async () => {
  const state = responseState();
  await handler({ method: 'GET', query: { id: 'sintel-open-movie', episode: 'trailer' } }, state.res);
  assert.equal(state.status, 200);
  assert.deepEqual(state.body, {
    playable: true,
    source: 'Blender Foundation Open Movie',
    playback: {
      type: 'mp4',
      url: 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4',
      title: 'Sintel — Legal Demo',
    },
    fallback: null,
  });
});

test('does not turn arbitrary catalog IDs into demo playback', async () => {
  const state = responseState();
  await handler({ method: 'GET', query: { id: 'naruto', episode: '1' } }, state.res);
  assert.equal(state.status, 404);
  assert.equal(state.body.code, 'STREAM_UNAVAILABLE');
});
