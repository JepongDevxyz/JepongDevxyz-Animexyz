# AnimeXYZ API

AnimeXYZ is a Node.js 18+ anime API client by **Jepong Devxyz**. It supports CommonJS, ESM, TypeScript declarations, configurable request settings, and an optional authorized `streamProvider` integration.

By default, AnimeXYZ tries the Niheaven API first and falls back to Jikan REST API v4 for metadata when the primary request fails. If you pass a custom `baseUrl`, the client switches to the AnimeXYZ-compatible route contract documented below.

## Installation

```bash
npm install animexyz-api
```

## CommonJS

```js
const AnimeXYZ = require('animexyz-api');

const api = new AnimeXYZ();
const results = await api.search('naruto', { page: 1, limit: 10 });
console.log(results);
```

## ESM

```js
import AnimeXYZ, { AnimeXYZError } from 'animexyz-api';

const api = new AnimeXYZ();
const popular = await api.popular({ page: 1, limit: 10 });
console.log(popular);
```

## Constructor options

```js
const api = new AnimeXYZ({
  niheavenBaseUrl: 'https://nimeheaven.vercel.app/api/v1',
  jikanBaseUrl: 'https://api.jikan.moe/v4',
  timeout: 15000,
  fallback: true,
  headers: {
    'X-App': 'my-anime-app',
  },
});
```

Available options:

- `baseUrl` — optional AnimeXYZ-compatible backend. Supplying it enables the legacy single-backend route contract.
- `niheavenBaseUrl` — Niheaven primary endpoint; defaults to `https://nimeheaven.vercel.app/api/v1`.
- `jikanBaseUrl` — Jikan metadata fallback endpoint; defaults to `https://api.jikan.moe/v4`.
- `fallback` — set to `false` to return the Niheaven error without trying Jikan.
- `timeout` — request timeout in milliseconds, or `false` to disable the built-in timeout.
- `fetch` — custom fetch implementation, useful for tests or alternate runtimes.
- `headers` — headers included with every request.
- `streamProvider` — optional function for an authorized watch-provider integration.

## Available methods

### `info()`

Returns AnimeXYZ/provider information. With a custom backend it requests `/info`.

```js
const info = await api.info();
```

### `home(options)`

Returns the current-season listing from Niheaven, with Jikan metadata fallback.

```js
const home = await api.home({ page: 1, limit: 10 });
```

### `newEpisodes(options)`

Returns the current airing schedule from Niheaven, with Jikan metadata fallback.

```js
const schedule = await api.newEpisodes({ page: 1, limit: 10 });
```

### `popular(options)`

Returns top anime from Niheaven, with Jikan metadata fallback.

```js
const popular = await api.popular({ page: 1, limit: 10 });
```

### `search(query, options)`

```js
const results = await api.search('one piece', { page: 1, limit: 10 });
```

Metadata responses include `source` and separate `niheavenId`/`malId` fields. List responses decorate each item in `results` or `data`; detail responses decorate the returned `data` object when the upstream uses a Jikan envelope. For a detail request, pass both IDs when possible so a Niheaven failure can use the matching MAL ID for the Jikan fallback.

```js
const detail = await api.anime({ niheavenId: 'nh-anime-id', malId: 20 });
const malDetail = await api.anime({ malId: 20 });
```

If a Niheaven-only detail request fails, AnimeXYZ does not send the Niheaven ID to Jikan as if it were a MAL ID; the combined error includes `FALLBACK_UNAVAILABLE` in its fallback details.

### `fastSearch(query, options)`

Uses the same public metadata search endpoint as `search()` on the default backend and keeps the separate method for compatibility with AnimeXYZ backends.

```js
const suggestions = await api.fastSearch('one pi', { limit: 5 });
```

### `season(name, options)`

Use a compact season name such as `2026fall`.

```js
const season = await api.season('2026fall', { page: 1, limit: 10 });
```

### `anime(id)`

```js
const anime = await api.anime('20');
```

### `stream(id, episode)`

With the default backend, this calls Niheaven for the requested episode. It does not bypass DRM or extract unauthorized direct media URLs.

```js
const providers = await api.stream('nh-anime-id', 1);
```

## Custom stream provider

Use `streamProvider` when your application already has an authorized provider integration:

```js
const api = new AnimeXYZ({
  streamProvider: async ({ id, episode }) => ({
    watchUrl: `https://your-authorized-provider.example/watch/${id}/${episode}`,
  }),
});

const stream = await api.stream('20', 1);
```

The provider receives the composed `AbortSignal`, so the client timeout and caller cancellation also stop a provider that observes the signal. If the provider ignores the signal, AnimeXYZ still rejects at the configured deadline. A regular provider error is wrapped in `AnimeXYZError` with code `STREAM_PROVIDER_ERROR`.

## Custom AnimeXYZ-compatible backend

When `baseUrl` is supplied, these routes are used:

| Method | Route |
| --- | --- |
| `info()` | `GET /info` |
| `home()` | `GET /` |
| `newEpisodes()` | `GET /new` |
| `popular()` | `GET /popular` |
| `search()` | `GET /search?q=...` |
| `fastSearch()` | `GET /fastsearch?q=...` |
| `season()` | `GET /season/:name` |
| `anime()` | `GET /anime/:id` |
| `stream()` | `GET /stream/:id/:episode` |

Pagination accepts positive `page` and `limit` values. AnimeXYZ validates `limit` from `1` through `100`; individual upstream services can impose lower limits.

## Error handling

```js
const { AnimeXYZError } = require('animexyz-api');

try {
  await api.anime('missing-id');
} catch (error) {
  if (error instanceof AnimeXYZError) {
    console.error(error.code, error.status, error.message);
  }
}
```

Common codes include `NETWORK_ERROR`, `TIMEOUT`, `ABORTED`, `HTTP_<status>`, `FALLBACK_FAILED`, `FALLBACK_UNAVAILABLE`, and `STREAM_PROVIDER_ERROR`. A caller-provided `AbortSignal` cancels the active request and prevents metadata fallback.

## TypeScript

```ts
import AnimeXYZ from 'animexyz-api';

const api = new AnimeXYZ();
const results = await api.search('naruto', { page: 1, limit: 10 });
```

## Demo website

A framework-free responsive demo/docs website lives in `website/`.

Opening or reloading the page displays the toast:

`Powered by Jepong Devxyz`

The toast auto-dismisses after about three seconds and does not block interaction.

## Development

```bash
npm test
npm run pack:check
```

## Requirements

- Node.js 18 or newer
- No runtime dependencies

## License

MIT © 2026 Jepong Devxyz
