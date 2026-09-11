# AnimeXYZ Package Design

Date: 2026-09-12
Owner: JepongDevxyz
Repository: JepongDevxyz/JepongDevxyz-Animexyz

## Goal

Build a standalone Node.js anime API client/package named **AnimeXYZ** with a developer experience similar to the referenced Niheaven package while keeping AnimeXYZ independently branded and avoiding a hard dependency on Niheaven's API.

The repository will also include a lightweight responsive demo/docs website for AnimeXYZ. The website is a presentation and usage layer only; it stays separate from the core package implementation.

## Scope

The first release will provide:

- CommonJS support (`require`)
- ESM support (`import`)
- TypeScript declarations
- Node.js 18+ support using built-in `fetch`
- Input validation
- Request timeout handling
- Structured custom errors
- Automated tests using Node's built-in test runner
- Package dry-run validation with `npm pack --dry-run`
- GitHub Actions CI
- README usage documentation
- MIT license
- responsive AnimeXYZ demo/docs website
- modern mobile/desktop layout with no overlapping content
- load toast that displays **Powered by Jepong Devxyz** on every fresh website open or reload

## Public API

Primary class: `AnimeXYZ`

Methods:

```js
await api.info();
await api.home({ page: 1, limit: 20 });
await api.newEpisodes({ page: 1, limit: 20 });
await api.popular({ page: 1, limit: 20 });
await api.search('naruto', { page: 1, limit: 10 });
await api.fastSearch('one pi', { page: 1, limit: 10 });
await api.season('2026fall', { page: 1, limit: 20 });
await api.anime('anime-id');
await api.stream('anime-id', 'episode-id');
```

The constructor will accept optional configuration:

```js
new AnimeXYZ({
  baseUrl,
  timeout,
  fetch,
  headers,
  streamProvider,
});
```

## Data Source Strategy

AnimeXYZ will not hard-code Niheaven's private deployment as its required backend.

For discovery and metadata, the client will target a configurable AnimeXYZ-compatible backend. The default package design will keep `baseUrl` configurable so the client can be pointed at a legal/public metadata service or a future AnimeXYZ backend without changing the package API.

The package will not ship code intended to bypass access controls or extract unauthorized direct media URLs.

`stream()` will use either:

1. an explicitly configured `streamProvider` function supplied by the package user, or
2. an AnimeXYZ-compatible backend response containing authorized provider/watch links.

This keeps the public method stable while separating metadata from provider-specific streaming logic.

## Request Layer

A single internal request method will:

- normalize the base URL
- append query parameters safely
- send GET requests with `Accept: application/json`
- support request-level headers
- support `AbortSignal`
- enforce a configurable timeout
- parse JSON responses when possible
- preserve text responses when JSON parsing is not possible
- throw `AnimeXYZError` on network and HTTP failures

## Validation

Validation rules:

- string identifiers and search queries must be non-empty
- `page` and `limit` must be positive integers when supplied
- `limit` must be between 1 and 100
- timeout must be a non-negative finite number or `false`
- constructor options must be an object
- injected `fetch` and `streamProvider` values must be functions when supplied

## Error Model

Custom error: `AnimeXYZError`

Fields:

- `name`
- `message`
- `code`
- `status`
- `details`
- `cause`

Expected codes include:

- `API_ERROR`
- `NETWORK_ERROR`
- `TIMEOUT`
- `HTTP_<status>`
- `STREAM_PROVIDER_ERROR`

## Demo / Docs Website

The `website/` directory will contain a static demo/docs site that can be hosted independently from the npm package.

Initial website goals:

- modern AnimeXYZ branding
- responsive layout for phones, tablets, and desktop screens
- no overlapping cards, navigation, buttons, or text
- hero section explaining AnimeXYZ
- feature/method overview
- CommonJS and ESM usage snippets
- package/API configuration examples
- clear GitHub/package call-to-action areas
- accessible buttons, focus states, and semantic HTML
- small JavaScript footprint with no framework requirement for v1

### Powered-by Toast

Every fresh page open or reload will trigger a non-blocking toast with the exact text:

`Powered by Jepong Devxyz`

Toast behavior:

- appears after page initialization
- remains visible long enough to read
- auto-dismisses after approximately 3 seconds
- does not block navigation or user interaction
- is positioned safely within the viewport on mobile and desktop
- uses an accessible live region so screen readers can announce it without stealing focus
- reappears on every new page load/reload rather than being permanently suppressed by local storage

The toast is purely presentation logic and will not be part of the Node.js package runtime.

## Package Layout

```text
JepongDevxyz-Animexyz/
├── .github/
│   └── workflows/
│       └── test.yml
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-09-12-animexyz-design.md
├── test/
│   └── animexyz.test.js
├── website/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── LICENSE
├── README.md
├── index.d.ts
├── index.js
├── index.mjs
├── package.json
└── package-lock.json
```

## Module Exports

CommonJS:

```js
const AnimeXYZ = require('animexyz-api');
const { AnimeXYZError } = require('animexyz-api');
```

ESM:

```js
import AnimeXYZ, { AnimeXYZError } from 'animexyz-api';
```

## Testing Strategy

Package tests will avoid relying on live external services for correctness. They will inject a mock `fetch` implementation and verify:

- constructor validation
- URL and query construction
- each public method's route mapping
- pagination validation
- search and identifier validation
- JSON parsing
- non-JSON response handling
- HTTP errors
- network errors
- timeout/error behavior where practical
- custom headers
- `streamProvider` behavior
- CommonJS exports
- ESM exports

Website verification will cover:

- required website files exist
- HTML references the local stylesheet and script correctly
- the page contains the AnimeXYZ branding and documented examples
- the `Powered by Jepong Devxyz` toast is initialized on page load
- basic static checks confirm responsive viewport metadata and no missing local asset references

The package will also run:

```bash
npm test
npm run pack:check
```

## Continuous Integration

GitHub Actions will run on pushes and pull requests using supported Node.js versions. CI will install dependencies, run tests, perform the package dry-run validation, and include static verification for the demo/docs website.

## README

The README will include:

- AnimeXYZ branding
- installation instructions
- CommonJS quick start
- ESM usage
- method-by-method examples
- custom backend configuration
- stream provider configuration
- error handling
- TypeScript example
- Node.js version requirement
- demo/docs website location
- license information

## Non-Goals for v1

The first release will not:

- host or redistribute copyrighted video files
- bypass DRM or access controls
- depend on Niheaven's deployment as the permanent backend
- include a database
- include user accounts
- automatically publish to npm
- require a frontend framework for the demo website

## Success Criteria

The first implementation is complete when:

1. all planned package and website files exist on `main`
2. `npm test` passes with zero test failures
3. `npm run pack:check` succeeds
4. CommonJS and ESM imports both work
5. TypeScript declarations match the public API
6. README examples match the implemented methods
7. CI configuration is valid and runs the same verification commands
8. no package code is hard-dependent on Niheaven's API endpoint
9. the demo/docs website renders responsively without overlapping content
10. the website displays `Powered by Jepong Devxyz` on every fresh page open or reload and auto-dismisses without blocking interaction
