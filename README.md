# AnimeXYZ API

AnimeXYZ is a Node.js 18+ anime API client by **Jepong Devxyz**. It supports CommonJS, ESM, TypeScript declarations, configurable request settings, and an optional authorized `streamProvider` integration.

By default, AnimeXYZ maps its metadata methods to the public Jikan REST API v4. If you pass a custom `baseUrl`, the client switches to the AnimeXYZ-compatible route contract documented below.

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
  baseUrl: 'https://your-api.example/v1',
  timeout: 15000,
  headers: {
    'X-App': 'my-anime-app',
  },
});
```

Available options:

- `baseUrl` — optional AnimeXYZ-compatible backend. If omitted, Jikan REST API v4 is used for metadata.
- `timeout` — request timeout in milliseconds, or `false` to disable the built-in timeout.
- `fetch` — custom fetch implementation, useful for tests or alternate runtimes.
- `headers` — headers included with every request.
- `streamProvider` — optional function for an authorized watch-provider integration.

## Available methods

### `info()`

Returns local AnimeXYZ/backend information when using the default Jikan backend. With a custom backend it requests `/info`.

```js
const info = await api.info();
```

### `home(options)`

Returns the current-season listing on the default backend.

```js
const home = await api.home({ page: 1, limit: 10 });
```

### `newEpisodes(options)`

Returns the current airing schedule on the default backend.

```js
const schedule = await api.newEpisodes({ page: 1, limit: 10 });
```

### `popular(options)`

Returns top anime on the default backend.

```js
const popular = await api.popular({ page: 1, limit: 10 });
```

### `search(query, options)`

```js
const results = await api.search('one piece', { page: 1, limit: 10 });
```

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

With the default backend, this returns known streaming-platform links for the anime and includes `requestedEpisode` in the result. It does not bypass DRM or extract unauthorized direct media URLs.

```js
const providers = await api.stream('20', 1);
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

If the provider throws a regular error, AnimeXYZ wraps it in `AnimeXYZError` with code `STREAM_PROVIDER_ERROR`.

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

Common codes include `NETWORK_ERROR`, `TIMEOUT`, `HTTP_<status>`, and `STREAM_PROVIDER_ERROR`.

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
