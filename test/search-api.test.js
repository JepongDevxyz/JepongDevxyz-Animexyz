'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../website/api/search');

test('uses Kitsu when Niheaven is irrelevant and Jikan is unavailable', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return new Response(JSON.stringify({ results: [{ id: 'x', title: 'Overflow' }] }));
    if (calls.length === 2) return new Response('{}', { status: 504 });
    return new Response(JSON.stringify({ data: [{ id: '11', attributes: { canonicalTitle: 'Naruto' } }] }));
  };
  const state = {};
  const res = {
    status(code) { state.status = code; return this; },
    setHeader() { return this; },
    json(body) { state.body = body; return body; },
  };
  try {
    await handler({ method: 'GET', query: { q: 'naruto', limit: '5' } }, res);
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(state.status, 200);
  assert.equal(state.body.source, 'kitsu');
  assert.equal(state.body.data[0].title, 'Naruto');
  assert.equal(calls.length, 3);\n  assert.equal(calls[2].options.headers.Accept, 'application/vnd.api+json');
});
