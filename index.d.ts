export interface AnimeXYZRequestOptions {
  headers?: Record<string, string>;
  timeout?: number | false;
  signal?: AbortSignal;
}

export interface AnimeXYZPaginationOptions extends AnimeXYZRequestOptions {
  page?: number;
  limit?: number;
}

export interface AnimeXYZStreamContext {
  id: string;
  episode: string;
  options: AnimeXYZRequestOptions;
  client: AnimeXYZ;
}

export interface AnimeXYZOptions {
  baseUrl?: string;
  niheavenBaseUrl?: string;
  jikanBaseUrl?: string;
  fallback?: boolean;
  timeout?: number | false;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  streamProvider?: (context: AnimeXYZStreamContext) => unknown | Promise<unknown>;
}

export interface AnimeXYZIdentifier {
  niheavenId?: string;
  malId?: number | string;
}

export class AnimeXYZError extends Error {
  code: string;
  status?: number;
  details?: unknown;
  cause?: unknown;
  provider?: string;
  constructor(message: string, options?: {
    code?: string;
    status?: number;
    details?: unknown;
    cause?: unknown;
  });
}

export class AnimeXYZ {
  baseUrl: string;
  niheavenBaseUrl: string;
  jikanBaseUrl: string;
  mode: 'custom' | 'fallback';
  fallback: boolean;
  timeout: number | false;
  fetch: typeof fetch;
  headers: Record<string, string>;
  streamProvider?: (context: AnimeXYZStreamContext) => unknown | Promise<unknown>;
  constructor(options?: AnimeXYZOptions);
  request<T = unknown>(path: string, query?: Record<string, unknown>, options?: AnimeXYZRequestOptions): Promise<T>;
  info<T = unknown>(options?: AnimeXYZRequestOptions): Promise<T>;
  home<T = unknown>(options?: AnimeXYZPaginationOptions): Promise<T>;
  newEpisodes<T = unknown>(options?: AnimeXYZPaginationOptions): Promise<T>;
  popular<T = unknown>(options?: AnimeXYZPaginationOptions): Promise<T>;
  search<T = unknown>(query: string, options?: AnimeXYZPaginationOptions): Promise<T>;
  fastSearch<T = unknown>(query: string, options?: AnimeXYZPaginationOptions): Promise<T>;
  season<T = unknown>(name: string, options?: AnimeXYZPaginationOptions): Promise<T>;
  anime<T = unknown>(id: string | number | AnimeXYZIdentifier, options?: AnimeXYZRequestOptions): Promise<T>;
  stream<T = unknown>(id: string | AnimeXYZIdentifier, episode: string | number, options?: AnimeXYZRequestOptions): Promise<T>;
}

export default AnimeXYZ;
