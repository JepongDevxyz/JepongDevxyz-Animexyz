'use strict';

const NIHEAVEN_SEARCH = 'https://nimeheaven.vercel.app/api/v1/search';
const JIKAN_SEARCH = 'https://api.jikan.moe/v4/anime';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.json(body);
}

async function request(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      const error = new Error('Upstream returned HTTP ' + response.status);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const query = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2) return json(res, 400, { error: 'q must contain at least 2 characters' });

  const limitValue = Number(req.query?.limit || 20);
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 25) : 20;

  try {
    const primary = await request(
      NIHEAVEN_SEARCH + '?q=' + encodeURIComponent(query) + '&limit=' + limit,
      12000,
    );
    return json(res, 200, { ...primary, source: 'niheaven' });
  } catch (primaryError) {
    try {
      const fallback = await request(
        JIKAN_SEARCH + '?q=' + encodeURIComponent(query) + '&limit=' + limit + '&sfw=true',
        12000,
      );
      return json(res, 200, { data: fallback?.data || [], pagination: fallback?.pagination || null, source: 'jikan' });
    } catch (fallbackError) {
      return json(res, 502, {
        error: 'Anime search providers unavailable',
        code: 'SEARCH_UPSTREAM_UNAVAILABLE',
        providers: {
          niheaven: primaryError.message,
          jikan: fallbackError.message,
        },
      });
    }
  }
};
