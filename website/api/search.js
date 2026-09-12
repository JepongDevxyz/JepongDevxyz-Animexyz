'use strict';

const NIHEAVEN_SEARCH = 'https://nimeheaven.vercel.app/api/v1/search';
const JIKAN_SEARCH = 'https://api.jikan.moe/v4/anime';
const KITSU_SEARCH = 'https://kitsu.io/api/edge/anime';

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

function itemsFrom(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function isRelevant(body, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const items = itemsFrom(body);
  if (!items.length) return false;
  return items.some((item) => {
    const title = String(
      item?.title || item?.name || item?.title_english || item?.englishTitle || '',
    ).toLowerCase();
    return tokens.some((token) => title.includes(token));
  });
}

function normalizeKitsu(body) {
  return (Array.isArray(body?.data) ? body.data : []).map((item) => {
    const attributes = item?.attributes || {};
    return {
      id: item?.id,
      kitsuId: item?.id,
      malId: attributes?.malId || null,
      title: attributes?.canonicalTitle || attributes?.titles?.en || attributes?.titles?.en_jp || 'Untitled anime',
      image: attributes?.posterImage?.medium || attributes?.posterImage?.small || null,
      episodes: [],
    };
  }).filter((item) => item.id);
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
    if (!isRelevant(primary, query)) throw new Error('Niheaven returned no relevant search results');
    return json(res, 200, { ...primary, source: 'niheaven' });
  } catch (primaryError) {
    try {
      const fallback = await request(
        JIKAN_SEARCH + '?q=' + encodeURIComponent(query) + '&limit=' + limit + '&sfw=true',
        12000,
      );
      return json(res, 200, { data: fallback?.data || [], pagination: fallback?.pagination || null, source: 'jikan' });
    } catch (fallbackError) {
      try {
        const kitsuUrl = KITSU_SEARCH + '?filter%5Btext%5D=' + encodeURIComponent(query)
          + '&page%5Blimit%5D=' + limit;
        const kitsu = await request(kitsuUrl, 12000);
        return json(res, 200, { data: normalizeKitsu(kitsu), pagination: null, source: 'kitsu' });
      } catch (kitsuError) {
        return json(res, 502, {
          error: 'Anime search providers unavailable',
          code: 'SEARCH_UPSTREAM_UNAVAILABLE',
          providers: {
            niheaven: primaryError.message,
            jikan: fallbackError.message,
            kitsu: kitsuError.message,
          },
        });
      }
    }
  }
};
