'use strict';

const DEFAULT_BASE_URL = 'https://api.jikan.moe/v4';
const DEFAULT_TIMEOUT = 15_000;

class AnimeXYZError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AnimeXYZError';
    this.code = options.code || 'API_ERROR';
    this.status = options.status;
    this.details = options.details;
    this.cause = options.cause;
  }
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function positiveInteger(value, name) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
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

function createTimeoutSignal(timeout, parentSignal) {
  if (parentSignal) return parentSignal;
  if (timeout === undefined || timeout === false) return undefined;

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeout);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  timer.unref?.();
  return controller.signal;
}

function parseSeasonName(name) {
  const value = requiredString(name, 'name').toLowerCase().replace(/[\s_-]+/g, '');
  const match = value.match(/^(\d{4})(winter|spring|summer|fall)$/);
  if (!match) {
    throw new TypeError('name must use format YYYY<season>, e.g. 2026fall');
  }
  return { year: match[1], season: match[2] };
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
    this.baseUrl = String(suppliedBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.isDefaultJikan = !suppliedBaseUrl || this.baseUrl === DEFAULT_BASE_URL;
    this.timeout = options.timeout === undefined ? DEFAULT_TIMEOUT : options.timeout;
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

  async request(path, query = {}, options = {}) {
    if (typeof path !== 'string') throw new TypeError('path must be a string');
    const route = path.trim();
    const suffix = route ? `/${route.replace(/^\/+/, '')}` : '/';
    const url = new URL(`${this.baseUrl}${suffix}`);

    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    let response;
    try {
      response = await this.fetch(url, {
        method: 'GET',
        headers: { ...this.headers, ...(options.headers || {}) },
        signal: createTimeoutSignal(
          options.timeout === undefined ? this.timeout : options.timeout,
          options.signal,
        ),
      });
    } catch (error) {
      throw new AnimeXYZError(`Request failed: ${error.message}`, {
        code: error?.name === 'AbortError' || error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        cause: error,
      });
    }

    const rawBody = await response.text();
    let body = rawBody;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      // Keep successful non-JSON responses as text.
    }

    if (!response.ok) {
      const apiError = body && typeof body === 'object' ? body.error : undefined;
      throw new AnimeXYZError(
        apiError?.message || `AnimeXYZ API returned HTTP ${response.status}`,
        {
          code: apiError?.code || `HTTP_${response.status}`,
          status: response.status,
          details: body,
        },
      );
    }

    return body;
  }

  info(options = {}) {
    if (this.isDefaultJikan) {
      return Promise.resolve({
        name: 'AnimeXYZ',
        version: '1.0.0',
        backend: 'Jikan REST API v4',
        baseUrl: this.baseUrl,
        streaming: 'Authorized provider links only',
      });
    }
    return this.request('info', {}, options);
  }

  home(options = {}) {
    const pagination = paginationParams(options);
    return this.isDefaultJikan
      ? this.request('seasons/now', pagination, options)
      : this.request('', pagination, options);
  }

  newEpisodes(options = {}) {
    const pagination = paginationParams(options);
    return this.isDefaultJikan
      ? this.request('schedules', pagination, options)
      : this.request('new', pagination, options);
  }

  popular(options = {}) {
    const pagination = paginationParams(options);
    return this.isDefaultJikan
      ? this.request('top/anime', pagination, options)
      : this.request('popular', pagination, options);
  }

  search(query, options = {}) {
    const params = { q: requiredString(query, 'query'), ...paginationParams(options) };
    return this.isDefaultJikan
      ? this.request('anime', params, options)
      : this.request('search', params, options);
  }

  fastSearch(query, options = {}) {
    const params = { q: requiredString(query, 'query'), ...paginationParams(options) };
    return this.isDefaultJikan
      ? this.request('anime', params, options)
      : this.request('fastsearch', params, options);
  }

  season(name, options = {}) {
    const pagination = paginationParams(options);
    if (this.isDefaultJikan) {
      const { year, season } = parseSeasonName(name);
      return this.request(`seasons/${year}/${season}`, pagination, options);
    }
    return this.request(`season/${encodeURIComponent(requiredString(name, 'name'))}`, pagination, options);
  }

  anime(id, options = {}) {
    const animeId = encodeURIComponent(requiredString(id, 'id'));
    return this.isDefaultJikan
      ? this.request(`anime/${animeId}/full`, {}, options)
      : this.request(`anime/${animeId}`, {}, options);
  }

  async stream(id, episode, options = {}) {
    const animeId = requiredString(id, 'id');
    const episodeId = requiredString(String(episode), 'episode');

    if (this.streamProvider) {
      try {
        return await this.streamProvider({ id: animeId, episode: episodeId, options, client: this });
      } catch (error) {
        if (error instanceof AnimeXYZError) throw error;
        throw new AnimeXYZError(`Stream provider failed: ${error.message}`, {
          code: 'STREAM_PROVIDER_ERROR',
          cause: error,
        });
      }
    }

    if (this.isDefaultJikan) {
      const result = await this.request(`anime/${encodeURIComponent(animeId)}/streaming`, {}, options);
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return { ...result, requestedEpisode: episodeId };
      }
      return result;
    }

    return this.request(
      `stream/${encodeURIComponent(animeId)}/${encodeURIComponent(episodeId)}`,
      {},
      options,
    );
  }
}

module.exports = AnimeXYZ;
module.exports.AnimeXYZ = AnimeXYZ;
module.exports.AnimeXYZError = AnimeXYZError;
