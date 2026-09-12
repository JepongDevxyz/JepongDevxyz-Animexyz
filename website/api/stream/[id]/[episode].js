'use strict';

const DEMO = Object.freeze({
  id: 'sintel-open-movie',
  episode: 'trailer',
  source: 'Blender Foundation Open Movie',
  title: 'Sintel — Legal Demo',
  url: 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4',
});

function reply(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  return res.json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return reply(res, 405, { error: 'Method not allowed' });
  }
  if (req.query?.id !== DEMO.id || req.query?.episode !== DEMO.episode) {
    return reply(res, 404, {
      error: 'No authorized direct stream is available for this title and episode',
      code: 'STREAM_UNAVAILABLE',
    });
  }
  return reply(res, 200, {
    playable: true,
    source: DEMO.source,
    playback: { type: 'mp4', url: DEMO.url, title: DEMO.title },
    fallback: null,
  });
};
