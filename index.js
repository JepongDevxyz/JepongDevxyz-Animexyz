'use strict';

const DEFAULT_NIHEAVEN_BASE_URL = 'https://nimeheaven.vercel.app/api/v1';
const DEFAULT_JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const DEFAULT_TIMEOUT = 15_000;

class AnimeXYZError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AnimeXYZError';
    this.code = options.code || 'API_ERROR';
    this.status = options.status;
    this.details = options.details;
    this.cause = options.cause;
    this.provider = options.provider;
  }
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(name + ' must be a non-empty string');
  }
  return value.trim();
}

function positiveInteger(value, name) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(name + ' must be a positive integer');
  }
  return value;
}

function paginationParams(options = {}) {
  const page = positiveInteger(options.page, 'page');
  const limit = positiveInteger(options.limit, 'limit');
  if (limit !== undefined && limit > 100) {
    throw new RangeError('limit must be between 1 and 100');
  }
  return { page, limit };
}

function parseSeasonName(name) {
  const value = requiredString(name, 'name').toLowerCase().replace(/[\s_-]+/g, '');
  const match = value.match(/^(\d{4})(winter|spring|summer|fall)$/);
  if (!match) {
    throw new TypeError('name must use format YYYY<season>, e.g. 2026fall');
  }
  return { year: match[1], season: match[2] };
}

function createRequestSignal(timeout, parentSignal) {
  const hasTimeout = timeout !== undefined && timeout !== false;
  if (!hasTimeout && !parentSignal) {
    return {
      signal: undefined,
      state: { timedOut: false, cancelled: false },
      cleanup() {},
    };
  }

  const controller = new AbortController();
  const state = { timedOut: false, cancelled: false };
  let timer;
  let removeParentListener = () => {};

  const cancelFromParent = () => {
    state.cancelled = true;
    controller.abort(parentSignal.reason);
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      cancelFromParent();
    } else {
      parentSignal.addEventListener('abort', cancelFromParent, { once: true });
      removeParentListener = () => parentSignal.removeEventListener('abort', cancelFromParent);
    }
  }

  if (hasTimeout) {
    timer = setTimeout(() => {
      state.timedOut = true;
      controller.abort(new Error('Request timed out'));
    }, timeout);
    timer.unref?.();
  }

  return {
    signal: controller.signal,
    state,
    cleanup() {
      if (timer) clearTimeout(timer);
      removeParentListener();
    },
  };
}

function errorSummary(error) {
  if (error instanceof AnimeXYZError) {
    return {
      name: error.name,
      code: error.code,
      status: error.status,
      message: error.message,
      provider: error.provider,
    };
  }
  return { name: error?.name, message: error?.message };
}

function isCancellation(error) {
  return error instanceof AnimeXYZError && error.code === 'ABORTED';
}

function normalizeAnimeIdentifier(value) {
  if (typeof value === 'string') {
    return { niheavenId: requiredString(value, 'id'), malId: null };
  }

  if (Number.isInteger(value) && value > 0) {
    return { niheavenId: null, malId: value };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('id must be a non-empty string, positive integer, or identifier object');
  }

  const niheavenValue = value.niheavenId ?? value.niheaven_id ?? value.nimeheavenId;
  const malValue = value.malId ?? value.mal_id;
  let niheavenId = null;
  let malId = null;

  if (niheavenValue !== undefined && niheavenValue !== null) {
    niheavenId = requiredString(String(niheavenValue), 'niheavenId');
  }
  if (malValue !== undefined && malValue !== null) {
    if (Number.isInteger(malValue) && malValue > 0) {
      malId = malValue;
    } else {
      const normalized = requiredString(String(malValue), 'malId');
      if (!/^\d+$/.test(normalized)) {
        throw new TypeError('malId must be a positive integer');
      }
      malId = Number(normalized);
    }
  }

  if (!niheavenId && malId === null) {
    throw new TypeError('identifier object must include niheavenId or malId');
  }
  return { niheavenId, malId };
}

function normalizeNiheavenId(value) {
  if (typeof value === 'object' && value !== null) {
    const identifier = normalizeAnimeIdentifier(value);
    if (!identifier.niheavenId) {
      throw new TypeError('stream requires a niheavenId');
    }
    return identifier.niheavenId;
  }
  return requiredString(value, 'id');
}

function firstPresent(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function extractIds(value, source) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { niheaven: null, mal: null };
  }

  const niheaven = source === 'niheaven'
    ? firstPresent(value, ['niheavenId', 'niheaven_id', 'nimeheavenId', 'nimeheaven_id', 'animeId', 'anime_id', 'id'])
    : firstPresent(value, ['niheavenId', 'niheaven_id', 'nimeheavenId', 'nimeheaven_id']);

  const mal = firstPresent(value, ['malId', 'mal_id', 'malID'])
    ?? (value.mal && typeof value.mal === 'object' ? firstPresent(value.mal, ['id', 'malId', 'mal_id']) : null);

  return { niheaven: niheaven ?? null, mal: mal ?? null };
}

function decorateMetadata(value, source, requestedIds, nested = false) {
  if (Array.isArray(value)) {
    return value.map((item) => decorateMetadata(item, source, requestedIds, true));
  }
  if (!value || typeof value !== 'object') return value;

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      result[key] = item.map((entry) => decorateMetadata(entry, source, requestedIds, true));
    } else if (item && typeof item === 'object' && (key === 'data' || key === 'anime')) {
      result[key] = decorateMetadata(item, source, requestedIds, true);
    } else {
      result[key] = item;
    }
  }

  const ids = extractIds(result, source);
  result.source = result.source || source;
  result.niheavenId = ids.niheaven;
  result.malId = ids.mal;
  result.ids = { niheaven: ids.niheaven, mal: ids.mal };
  if (!nested && requestedIds) {
    result.requestedIds = {
      niheaven: requestedIds.niheavenId ?? null,
      mal: requestedIds.malId ?? null,
    };
  }
  return result;
}

class AnimeXYZ {
  constructor(options = {}) {
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      throw new TypeError('options must be an object');
    }
    if (options.fetch !== undefined && typeof options.fetch !== 'function') {
      throw new TypeError('fetch must be a function');
    }
    if (options.streamProvider !== undefined && typeof options.streamProvider !== 'function') {
      throw new TypeError('streamProvider must be a function');
    }

    const suppliedBaseUrl = options.baseUrl;
    this.mode = suppliedBaseUrl ? 'custom' : 'fallback';
    this.baseUrl = String(suppliedBaseUrl || options.niheavenBaseUrl || DEFAULT_NIHEAVEN_BASE_URL).replace(/\/+$/, '');
    this.niheavenBaseUrl = String(options.niheavenBaseUrl || DEFAULT_NIHEAVEN_BASE_URL).replace(/\/+$/, '');
    this.jikanBaseUrl = String(options.jikanBaseUrl || DEFAULT_JIKAN_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout === undefined ? DEFAULT_TIMEOUT : options.timeout;
    this.fallback = options.fallback !== false;
    this.fetch = options.fetch || globalThis.fetch;
    this.streamProvider = options.streamProvider;
    this.headers = { Accept: 'application/json', ...(options.headers || {}) };

    if (typeof this.fetch !== 'function') {
      throw new Error('AnimeXYZ requires Node.js 18+ or a fetch implementation');
    }
    if (this.timeout !== false && (!Number.isFinite(this.timeout) || this.timeout < 0)) {
      throw new TypeError('timeout must be a non-negative number or false');
    }
  }

  async requestAt(baseUrl, path, query = {}, options = {}, provider = 'custom') {
    if (typeof path !== 'string') throw new TypeError('path must be a string');
    const route = path.trim();
    const suffix = route ? '/' + route.replace(/^\/+/, '') : '/';
    const url = new URL(baseUrl + suffix);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const timeout = options.timeout === undefined ? this.timeout : options.timeout;
    const requestSignal = createRequestSignal(timeout, options.signal);
    if (requestSignal.state.cancelled) {
      requestSignal.cleanup();
      throw new AnimeXYZError('Request was cancelled', {
        code: 'ABORTED',
        cause: options.signal.reason,
        provider,
      });
    }

    try {
      const response = await this.fetch(url, {
        method: 'GET',
        headers: { ...this.headers, ...(options.headers || {}) },
        signal: requestSignal.signal,
      });

      let rawBody;
      try {
        rawBody = await response.text();
      } catch (error) {
        throw this.toRequestError(error, requestSignal.state, provider);
      }

      let body = rawBody;
      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        // Keep successful non-JSON responses as text.
      }

      if (!response.ok) {
        const apiError = body && typeof body === 'object' ? body.error : undefined;
        throw new AnimeXYZError(
          apiError?.message || provider + ' API returned HTTP ' + response.status,
          {
            code: apiError?.code || 'HTTP_' + response.status,
            status: response.status,
            details: body,
            provider,
          },
        );
      }

      return body;
    } catch (error) {
      if (error instanceof AnimeXYZError) throw error;
      throw this.toRequestError(error, requestSignal.state, provider);
    } finally {
      requestSignal.cleanup();
    }
  }

  toRequestError(error, state, provider) {
    const code = state.timedOut || error?.name === 'TimeoutError'
      ? 'TIMEOUT'
      : state.cancelled || error?.name === 'AbortError'
        ? 'ABORTED'
        : 'NETWORK_ERROR';
    const message = code === 'TIMEOUT'
      ? 'Request timed out'
      : code === 'ABORTED'
        ? 'Request was cancelled'
        : 'Request failed: ' + (error?.message || String(error));
    return new AnimeXYZError(message, { code, cause: error, provider });
  }

  async withMetadataFallback(primary, fallback, options, requestedIds) {
    try {
      const value = await primary();
      return decorateMetadata(value, 'niheaven', requestedIds);
    } catch (primaryError) {
      if (!this.fallback || isCancellation(primaryError)) throw primaryError;
      try {
        const value = await fallback(primaryError);
        return decorateMetadata(value, 'jikan', requestedIds);
      } catch (fallbackError) {
        if (isCancellation(fallbackError)) throw fallbackError;
        throw new AnimeXYZError(
          'Metadata request failed on Niheaven and Jikan: ' + primaryError.message + '; ' + fallbackError.message,
          {
            code: 'FALLBACK_FAILED',
            details: {
              primary: errorSummary(primaryError),
              fallback: errorSummary(fallbackError),
            },
            cause: fallbackError,
            provider: 'jikan',
          },
        );
      }
    }
  }

  request(path, query = {}, options = {}) {
    return this.requestAt(this.baseUrl, path, query, options, this.mode === 'custom' ? 'custom' : 'niheaven');
  }

  info(options = {}) {
    if (this.mode === 'custom') return this.requestAt(this.baseUrl, 'info', {}, options, 'custom');
    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, 'info', {}, options, 'niheaven').then((value) => {
        const decorated = decorateMetadata(value, 'niheaven');
        return decorated && typeof decorated === 'object'
          ? { name: 'AnimeXYZ', version: '1.1.0', ...decorated }
          : decorated;
      }),
      () => Promise.resolve({
        name: 'AnimeXYZ',
        version: '1.1.0',
        primary: 'Niheaven',
        fallback: 'Jikan REST API v4',
        baseUrl: this.niheavenBaseUrl,
      }),
      options,
    );
  }

  home(options = {}) {
    const pagination = paginationParams(options);
    if (this.mode === 'custom') return this.requestAt(this.baseUrl, '', pagination, options, 'custom');
    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, '', pagination, options, 'niheaven'),
      () => this.requestAt(this.jikanBaseUrl, 'seasons/now', pagination, options, 'jikan'),
      options,
    );
  }

  newEpisodes(options = {}) {
    const pagination = paginationParams(options);
    if (this.mode === 'custom') return this.requestAt(this.baseUrl, 'new', pagination, options, 'custom');
    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, 'new', pagination, options, 'niheaven'),
      () => this.requestAt(this.jikanBaseUrl, 'schedules', pagination, options, 'jikan'),
      options,
    );
  }

  popular(options = {}) {
    const pagination = paginationParams(options);
    if (this.mode === 'custom') return this.requestAt(this.baseUrl, 'popular', pagination, options, 'custom');
    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, 'popular', pagination, options, 'niheaven'),
      () => this.requestAt(this.jikanBaseUrl, 'top/anime', pagination, options, 'jikan'),
      options,
    );
  }

  search(query, options = {}) {
    const params = { q: requiredString(query, 'query'), ...paginationParams(options) };
    if (this.mode === 'custom') return this.requestAt(this.baseUrl, 'search', params, options, 'custom');
    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, 'search', params, options, 'niheaven'),
      () => this.requestAt(this.jikanBaseUrl, 'anime', params, options, 'jikan'),
      options,
    );
  }

  fastSearch(query, options = {}) {
    const params = { q: requiredString(query, 'query'), ...paginationParams(options) };
    if (this.mode === 'custom') return this.requestAt(this.baseUrl, 'fastsearch', params, options, 'custom');
    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, 'fastsearch', params, options, 'niheaven'),
      () => this.requestAt(this.jikanBaseUrl, 'anime', params, options, 'jikan'),
      options,
    );
  }

  season(name, options = {}) {
    const seasonName = requiredString(name, 'name');
    const pagination = paginationParams(options);
    if (this.mode === 'custom') {
      return this.requestAt(this.baseUrl, 'season/' + encodeURIComponent(seasonName), pagination, options, 'custom');
    }
    const parsed = parseSeasonName(seasonName);
    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, 'season/' + encodeURIComponent(seasonName), pagination, options, 'niheaven'),
      () => this.requestAt(this.jikanBaseUrl, 'seasons/' + parsed.year + '/' + parsed.season, pagination, options, 'jikan'),
      options,
    );
  }

  anime(id, options = {}) {
    const identifier = normalizeAnimeIdentifier(id);
    if (this.mode === 'custom') {
      const routeId = identifier.niheavenId || String(identifier.malId);
      return this.requestAt(this.baseUrl, 'anime/' + encodeURIComponent(routeId), {}, options, 'custom');
    }

    const jikanId = identifier.malId ?? identifier.niheavenId;
    if (!identifier.niheavenId && identifier.malId !== null) {
      return this.requestAt(this.jikanBaseUrl, 'anime/' + encodeURIComponent(String(jikanId)) + '/full', {}, options, 'jikan')
        .then((value) => decorateMetadata(value, 'jikan', identifier));
    }

    return this.withMetadataFallback(
      () => this.requestAt(this.niheavenBaseUrl, 'anime/' + encodeURIComponent(identifier.niheavenId), {}, options, 'niheaven'),
      () => this.requestAt(this.jikanBaseUrl, 'anime/' + encodeURIComponent(String(jikanId)) + '/full', {}, options, 'jikan'),
      options,
      identifier,
    );
  }

  async stream(id, episode, options = {}) {
    const animeId = normalizeNiheavenId(id);
    const episodeId = requiredString(String(episode), 'episode');

    if (this.streamProvider) {
      try {
        return await this.streamProvider({ id: animeId, episode: episodeId, options, client: this });
      } catch (error) {
        if (error instanceof AnimeXYZError) throw error;
        throw new AnimeXYZError('Stream provider failed: ' + error.message, {
          code: 'STREAM_PROVIDER_ERROR',
          cause: error,
        });
      }
    }

    if (this.mode === 'custom') {
      return this.requestAt(
        this.baseUrl,
        'stream/' + encodeURIComponent(animeId) + '/' + encodeURIComponent(episodeId),
        {},
        options,
        'custom',
      );
    }

    return this.requestAt(
      this.niheavenBaseUrl,
      'stream/' + encodeURIComponent(animeId) + '/' + encodeURIComponent(episodeId),
      {},
      options,
      'niheaven',
    );
  }
}

module.exports = AnimeXYZ;
module.exports.AnimeXYZ = AnimeXYZ;
module.exports.AnimeXYZError = AnimeXYZError;
module.exports.DEFAULT_NIHEAVEN_BASE_URL = DEFAULT_NIHEAVEN_BASE_URL;
module.exports.DEFAULT_JIKAN_BASE_URL = DEFAULT_JIKAN_BASE_URL;
