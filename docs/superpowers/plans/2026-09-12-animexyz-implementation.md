# AnimeXYZ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a standalone `AnimeXYZ` Node.js API client/package plus a responsive static demo/docs website that shows `Powered by Jepong Devxyz` on every page load.

**Architecture:** The repository contains two isolated units: a framework-free Node.js package at the repository root and a static website under `website/`. The package exposes one public `AnimeXYZ` client with validation, request/error handling, CommonJS/ESM/TypeScript exports, and an optional injected stream provider; the website documents the package without becoming a runtime dependency.

**Tech Stack:** Node.js 18+, built-in `fetch`, CommonJS, ESM, TypeScript declaration files, Node built-in test runner, npm, static HTML/CSS/JavaScript, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-animexyz-design.md`

## Global Constraints

- Node.js version floor: `>=18`.
- Package name: `animexyz-api`.
- Primary class: `AnimeXYZ`.
- Custom error: `AnimeXYZError`.
- Public methods: `info`, `home`, `newEpisodes`, `popular`, `search`, `fastSearch`, `season`, `anime`, `stream`.
- `limit` must be between `1` and `100` when supplied.
- Package runtime must not be hard-dependent on Niheaven's API endpoint.
- Package must not bypass DRM/access controls or extract unauthorized direct media URLs.
- Demo website must be framework-free for v1 and responsive without overlapping content.
- Demo website must display the exact toast text `Powered by Jepong Devxyz` on every fresh page open or reload and auto-dismiss after approximately 3 seconds.

---

## Niheaven-primary fallback draft update (2026-09-12)

This draft keeps the existing public AnimeXYZ methods and adds the provider flow below:

- Niheaven (`https://nimeheaven.vercel.app/api/v1`) is the default primary for discovery, metadata, and episode stream routes.
- Jikan (`https://api.jikan.moe/v4`) is the default metadata fallback for `info`, `home`, `newEpisodes`, `popular`, `search`, `fastSearch`, `season`, and `anime`.
- `anime()` accepts a Niheaven ID, a MAL ID, or an object containing `niheavenId` and/or `malId`; response items keep those IDs in separate fields.
- Request timeouts and caller cancellation are composed. Cancellation returns `ABORTED` and does not trigger the Jikan fallback; a failed fallback returns `FALLBACK_FAILED` with both error summaries.
- The existing static website toast remains exactly `Powered by Jepong Devxyz` and still initializes on every page load.

The draft is verified by the Node test runner and package dry-run locally before it is pushed to an isolated branch.

---

## File Structure

- `index.js` — CommonJS implementation and canonical package logic.
- `index.mjs` — ESM re-export bridge.
- `index.d.ts` — TypeScript declarations for the public API.
- `package.json` — package metadata, exports, scripts, Node version floor.
- `package-lock.json` — reproducible npm metadata.
- `test/animexyz.test.js` — package and static website tests using `node:test`.
- `website/index.html` — semantic responsive docs/demo page.
- `website/styles.css` — responsive layout, toast styling, focus states.
- `website/app.js` — page-load toast behavior only.
- `.github/workflows/test.yml` — CI for tests and package validation.
- `README.md` — installation, API, configuration, website, and examples.
- `LICENSE` — MIT license.

---

### Task 1: Package Metadata and Failing API Contract Tests

**Files:**
- Create: `package.json`
- Create: `test/animexyz.test.js`

**Interfaces:**
- Produces package name `animexyz-api`, Node `>=18`, scripts `test` and `pack:check`.
- Defines expected public constructor/export contract consumed by Tasks 2–4.

- [ ] **Step 1: Create `package.json` with exact package contract**

```json
{
  "name": "animexyz-api",
  "version": "1.0.0",
  "description": "AnimeXYZ API client by Jepong Devxyz",
  "main": "index.js",
  "types": "index.d.ts",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.mjs",
      "require": "./index.js",
      "default": "./index.mjs"
    }
  },
  "files": [
    "index.js",
    "index.mjs",
    "index.d.ts",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "test": "node --test",
    "pack:check": "npm pack --dry-run"
  },
  "keywords": ["anime", "anime-api", "animexyz", "api-client"],
  "author": "Jepong Devxyz",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Write initial failing tests for exports and constructor validation**

Create `test/animexyz.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const AnimeXYZ = require('../index.js');
const { AnimeXYZError } = require('../index.js');

test('CommonJS exports AnimeXYZ and AnimeXYZError', () => {
  assert.equal(typeof AnimeXYZ, 'function');
  assert.equal(typeof AnimeXYZError, 'function');
});

test('constructor rejects non-object options', () => {
  assert.throws(() => new AnimeXYZ(null), /options must be an object/);
});

test('constructor rejects invalid fetch', () => {
  assert.throws(() => new AnimeXYZ({ fetch: 123 }), /fetch must be a function/);
});

test('constructor rejects invalid streamProvider', () => {
  assert.throws(
    () => new AnimeXYZ({ streamProvider: 123 }),
    /streamProvider must be a function/,
  );
});

test('constructor accepts a custom baseUrl and strips trailing slash', () => {
  const api = new AnimeXYZ({
    baseUrl: 'https://example.test/api/',
    fetch: async () => ({ ok: true, text: async () => '{}' }),
  });
  assert.equal(api.baseUrl, 'https://example.test/api');
});
```

- [ ] **Step 3: Run tests and confirm expected failure**

Run:

```bash
npm test
```

Expected: FAIL because `index.js` does not exist yet.

- [ ] **Step 4: Commit contract tests and package metadata**

```bash
git add package.json test/animexyz.test.js
git commit -m "test: define AnimeXYZ package contract"
```

---

### Task 2: Core Client, Validation, and Error Handling

**Files:**
- Create: `index.js`
- Modify: `test/animexyz.test.js`

**Interfaces:**
- Produces class `AnimeXYZ` and class `AnimeXYZError`.
- Constructor signature: `new AnimeXYZ(options = {})`.
- Public helper: `request(path, query = {}, options = {})`.
- Public methods defined exactly as in the spec.

- [ ] **Step 1: Add failing route, validation, and HTTP/network tests**

Append to `test/animexyz.test.js`:

```js
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function createRecorder(responseBody = { ok: true }) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse(responseBody);
  };
  return { calls, fetch };
}

test('search builds encoded query and pagination', async () => {
  const recorder = createRecorder({ results: [] });
  const api = new AnimeXYZ({ baseUrl: 'https://example.test/api/v1', fetch: recorder.fetch });
  await api.search('one piece', { page: 2, limit: 10 });
  const url = new URL(recorder.calls[0].url);
  assert.equal(url.pathname, '/api/v1/search');
  assert.equal(url.searchParams.get('q'), 'one piece');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('limit'), '10');
});

test('method routes match the AnimeXYZ contract', async () => {
  const recorder = createRecorder({ ok: true });
  const api = new AnimeXYZ({ baseUrl: 'https://example.test/api/v1', fetch: recorder.fetch });
  await api.info();
  await api.home({ page: 1 });
  await api.newEpisodes();
  await api.popular();
  await api.fastSearch('nar');
  await api.season('2026fall');
  await api.anime('abc');
  await api.stream('abc', '12');
  const paths = recorder.calls.map(({ url }) => new URL(url).pathname);
  assert.deepEqual(paths, [
    '/api/v1/info',
    '/api/v1/',
    '/api/v1/new',
    '/api/v1/popular',
    '/api/v1/fastsearch',
    '/api/v1/season/2026fall',
    '/api/v1/anime/abc',
    '/api/v1/stream/abc/12',
  ]);
});

test('limit outside 1..100 is rejected', async () => {
  const api = new AnimeXYZ({ fetch: async () => jsonResponse({}) });
  await assert.rejects(() => api.home({ limit: 101 }), /limit must be between 1 and 100/);
});

test('empty query is rejected', async () => {
  const api = new AnimeXYZ({ fetch: async () => jsonResponse({}) });
  await assert.rejects(() => api.search('   '), /query must be a non-empty string/);
});

test('HTTP errors throw AnimeXYZError with status and code', async () => {
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Missing' } }, 404),
  });
  await assert.rejects(
    () => api.anime('missing'),
    (error) => error instanceof AnimeXYZError && error.status === 404 && error.code === 'NOT_FOUND',
  );
});

test('network errors throw AnimeXYZError', async () => {
  const api = new AnimeXYZ({ fetch: async () => { throw new Error('offline'); } });
  await assert.rejects(
    () => api.info(),
    (error) => error instanceof AnimeXYZError && error.code === 'NETWORK_ERROR',
  );
});

test('non-JSON success body is preserved as text', async () => {
  const api = new AnimeXYZ({
    fetch: async () => ({ ok: true, status: 200, text: async () => 'hello' }),
  });
  assert.equal(await api.info(), 'hello');
});
```

- [ ] **Step 2: Run tests and confirm they fail for missing behavior**

```bash
npm test
```

Expected: FAIL on route/validation/error tests.

- [ ] **Step 3: Implement `index.js`**

Create `index.js`:

```js
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

    this.baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
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
        code: error.name === 'AbortError' || error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        cause: error,
      });
    }

    const rawBody = await response.text();
    let body = rawBody;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {}

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

  info(options = {}) { return this.request('info', {}, options); }
  home(options = {}) { return this.request('', paginationParams(options), options); }
  newEpisodes(options = {}) { return this.request('new', paginationParams(options), options); }
  popular(options = {}) { return this.request('popular', paginationParams(options), options); }
  search(query, options = {}) {
    return this.request('search', { q: requiredString(query, 'query'), ...paginationParams(options) }, options);
  }
  fastSearch(query, options = {}) {
    return this.request('fastsearch', { q: requiredString(query, 'query'), ...paginationParams(options) }, options);
  }
  season(name, options = {}) {
    return this.request(`season/${encodeURIComponent(requiredString(name, 'name'))}`, paginationParams(options), options);
  }
  anime(id, options = {}) {
    return this.request(`anime/${encodeURIComponent(requiredString(id, 'id'))}`, {}, options);
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
    return this.request(`stream/${encodeURIComponent(animeId)}/${encodeURIComponent(episodeId)}`, {}, options);
  }
}

module.exports = AnimeXYZ;
module.exports.AnimeXYZ = AnimeXYZ;
module.exports.AnimeXYZError = AnimeXYZError;
```

- [ ] **Step 4: Run tests and verify core tests pass**

```bash
npm test
```

Expected: all Task 1–2 tests PASS.

- [ ] **Step 5: Commit core client**

```bash
git add index.js test/animexyz.test.js
git commit -m "feat: add AnimeXYZ API client"
```

---

### Task 3: Stream Provider Contract and Module Compatibility

**Files:**
- Create: `index.mjs`
- Create: `index.d.ts`
- Modify: `test/animexyz.test.js`

**Interfaces:**
- ESM default export: `AnimeXYZ`.
- Named exports: `AnimeXYZ`, `AnimeXYZError`.
- `streamProvider` signature: `({ id, episode, options, client }) => Promise<unknown> | unknown`.

- [ ] **Step 1: Add failing stream provider and ESM tests**

Append:

```js
test('streamProvider receives normalized identifiers and client', async () => {
  let received;
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({}),
    streamProvider: async (context) => {
      received = context;
      return { watchUrl: 'https://legal.example/watch/1' };
    },
  });
  const result = await api.stream(' abc ', 12);
  assert.deepEqual(result, { watchUrl: 'https://legal.example/watch/1' });
  assert.equal(received.id, 'abc');
  assert.equal(received.episode, '12');
  assert.equal(received.client, api);
});

test('streamProvider failures become STREAM_PROVIDER_ERROR', async () => {
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({}),
    streamProvider: async () => { throw new Error('provider down'); },
  });
  await assert.rejects(
    () => api.stream('abc', 1),
    (error) => error instanceof AnimeXYZError && error.code === 'STREAM_PROVIDER_ERROR',
  );
});

test('ESM exports default AnimeXYZ and named AnimeXYZError', async () => {
  const modulePath = path.resolve(__dirname, '../index.mjs');
  const mod = await import(`file://${modulePath}`);
  assert.equal(typeof mod.default, 'function');
  assert.equal(typeof mod.AnimeXYZ, 'function');
  assert.equal(typeof mod.AnimeXYZError, 'function');
});
```

- [ ] **Step 2: Run tests and confirm ESM test fails**

```bash
npm test
```

Expected: FAIL because `index.mjs` does not exist.

- [ ] **Step 3: Create ESM bridge**

Create `index.mjs`:

```js
import cjs from './index.js';

export const AnimeXYZ = cjs.AnimeXYZ || cjs;
export const AnimeXYZError = cjs.AnimeXYZError;
export default AnimeXYZ;
```

- [ ] **Step 4: Create TypeScript declarations**

Create `index.d.ts`:

```ts
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
  timeout?: number | false;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  streamProvider?: (context: AnimeXYZStreamContext) => unknown | Promise<unknown>;
}

export class AnimeXYZError extends Error {
  code: string;
  status?: number;
  details?: unknown;
  cause?: unknown;
  constructor(message: string, options?: {
    code?: string;
    status?: number;
    details?: unknown;
    cause?: unknown;
  });
}

export class AnimeXYZ {
  baseUrl: string;
  timeout: number | false;
  fetch: typeof fetch;
  headers: Record<string, string>;
  constructor(options?: AnimeXYZOptions);
  request<T = unknown>(path: string, query?: Record<string, unknown>, options?: AnimeXYZRequestOptions): Promise<T>;
  info<T = unknown>(options?: AnimeXYZRequestOptions): Promise<T>;
  home<T = unknown>(options?: AnimeXYZPaginationOptions): Promise<T>;
  newEpisodes<T = unknown>(options?: AnimeXYZPaginationOptions): Promise<T>;
  popular<T = unknown>(options?: AnimeXYZPaginationOptions): Promise<T>;
  search<T = unknown>(query: string, options?: AnimeXYZPaginationOptions): Promise<T>;
  fastSearch<T = unknown>(query: string, options?: AnimeXYZPaginationOptions): Promise<T>;
  season<T = unknown>(name: string, options?: AnimeXYZPaginationOptions): Promise<T>;
  anime<T = unknown>(id: string, options?: AnimeXYZRequestOptions): Promise<T>;
  stream<T = unknown>(id: string, episode: string | number, options?: AnimeXYZRequestOptions): Promise<T>;
}

export default AnimeXYZ;
```

- [ ] **Step 5: Run tests and verify package compatibility tests pass**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit module compatibility**

```bash
git add index.mjs index.d.ts test/animexyz.test.js
git commit -m "feat: add ESM and TypeScript support"
```

---

### Task 4: Demo Website and Powered-by Toast

**Files:**
- Create: `website/index.html`
- Create: `website/styles.css`
- Create: `website/app.js`
- Modify: `test/animexyz.test.js`

**Interfaces:**
- `website/index.html` references `./styles.css` and `./app.js`.
- Toast element id: `poweredToast`.
- Exact toast text: `Powered by Jepong Devxyz`.
- `website/app.js` adds class `show` on load and removes it after `3000` ms.

- [ ] **Step 1: Add failing static website tests**

Append:

```js
test('website files and required branding exist', () => {
  const root = path.resolve(__dirname, '../website');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

  assert.match(html, /<meta[^>]+name=["']viewport["']/i);
  assert.match(html, /AnimeXYZ/);
  assert.match(html, /\.\/styles\.css/);
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /id=["']poweredToast["']/);
  assert.match(html, /Powered by Jepong Devxyz/);
  assert.match(css, /\.toast/);
  assert.match(js, /poweredToast/);
  assert.match(js, /3000/);
});
```

- [ ] **Step 2: Run tests and confirm website test fails**

```bash
npm test
```

Expected: FAIL with missing `website/index.html`.

- [ ] **Step 3: Create semantic website HTML**

Create `website/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="AnimeXYZ API client by Jepong Devxyz">
  <title>AnimeXYZ — Anime API Client</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="AnimeXYZ home">AnimeXYZ</a>
    <nav aria-label="Primary navigation">
      <a href="#features">Features</a>
      <a href="#usage">Usage</a>
      <a href="#methods">Methods</a>
    </nav>
  </header>

  <main id="top">
    <section class="hero">
      <p class="eyebrow">Jepong Devxyz</p>
      <h1>AnimeXYZ API Client</h1>
      <p class="lead">A clean Node.js client for anime metadata, discovery, and configurable authorized watch-provider links.</p>
      <div class="actions">
        <a class="button primary" href="#usage">Get Started</a>
        <a class="button" href="https://github.com/JepongDevxyz/JepongDevxyz-Animexyz">View on GitHub</a>
      </div>
    </section>

    <section id="features" class="section">
      <h2>Built for simple integration</h2>
      <div class="grid">
        <article class="card"><h3>CommonJS + ESM</h3><p>Use require or import with the same API.</p></article>
        <article class="card"><h3>TypeScript Ready</h3><p>Type declarations ship with the package.</p></article>
        <article class="card"><h3>Configurable Provider</h3><p>Keep streaming-provider logic separate and authorized.</p></article>
      </div>
    </section>

    <section id="usage" class="section">
      <h2>Quick start</h2>
      <pre><code>const AnimeXYZ = require('animexyz-api');
const api = new AnimeXYZ({ baseUrl: 'https://your-api.example/v1' });
const results = await api.search('naruto', { page: 1, limit: 10 });</code></pre>
    </section>

    <section id="methods" class="section">
      <h2>Methods</h2>
      <div class="method-list">
        <code>info()</code><code>home()</code><code>newEpisodes()</code><code>popular()</code>
        <code>search()</code><code>fastSearch()</code><code>season()</code><code>anime()</code><code>stream()</code>
      </div>
    </section>
  </main>

  <footer>AnimeXYZ • Jepong Devxyz</footer>

  <div id="poweredToast" class="toast" role="status" aria-live="polite" aria-atomic="true">
    Powered by Jepong Devxyz
  </div>
  <script src="./app.js" defer></script>
</body>
</html>
```

- [ ] **Step 4: Create responsive non-overlapping CSS**

Create `website/styles.css` implementing:

```css
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 0; background: #0b1020; color: #f7f8fb; line-height: 1.6; }
a { color: inherit; }
.site-header { position: sticky; top: 0; z-index: 20; display: flex; gap: 1rem; align-items: center; justify-content: space-between; padding: 1rem clamp(1rem, 4vw, 4rem); background: rgba(11,16,32,.88); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,.08); }
.site-header nav { display: flex; gap: .9rem; flex-wrap: wrap; }
.brand { font-weight: 800; text-decoration: none; }
main { width: min(1120px, calc(100% - 2rem)); margin: 0 auto; }
.hero { padding: clamp(4rem, 10vw, 8rem) 0; }
.hero h1 { margin: .25rem 0 1rem; font-size: clamp(2.5rem, 9vw, 5.5rem); line-height: .95; overflow-wrap: anywhere; }
.eyebrow { letter-spacing: .12em; text-transform: uppercase; opacity: .72; }
.lead { max-width: 760px; font-size: clamp(1rem, 2.5vw, 1.25rem); color: #c6cbe0; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: .8rem 1rem; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; text-decoration: none; }
.button.primary { background: #fff; color: #0b1020; }
.section { padding: 2.5rem 0; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.card, pre { min-width: 0; border: 1px solid rgba(255,255,255,.1); border-radius: 18px; background: rgba(255,255,255,.04); }
.card { padding: 1.25rem; }
pre { padding: 1rem; overflow-x: auto; }
.method-list { display: flex; flex-wrap: wrap; gap: .65rem; }
.method-list code { padding: .55rem .7rem; border-radius: 10px; background: rgba(255,255,255,.06); }
footer { padding: 3rem 1rem; text-align: center; color: #a9afc6; }
.toast { position: fixed; right: max(1rem, env(safe-area-inset-right)); bottom: max(1rem, env(safe-area-inset-bottom)); z-index: 50; max-width: min(90vw, 360px); padding: .9rem 1rem; border-radius: 14px; background: #f7f8fb; color: #0b1020; box-shadow: 0 16px 40px rgba(0,0,0,.35); opacity: 0; transform: translateY(14px); pointer-events: none; transition: opacity .2s ease, transform .2s ease; }
.toast.show { opacity: 1; transform: translateY(0); }
:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
@media (max-width: 760px) {
  .site-header { align-items: flex-start; flex-direction: column; }
  .grid { grid-template-columns: 1fr; }
  .hero { padding-top: 3rem; }
}
```

- [ ] **Step 5: Create page-load toast script**

Create `website/app.js`:

```js
'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const toast = document.getElementById('poweredToast');
  if (!toast) return;

  requestAnimationFrame(() => toast.classList.add('show'));
  window.setTimeout(() => toast.classList.remove('show'), 3000);
});
```

- [ ] **Step 6: Run tests and verify website checks pass**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit website**

```bash
git add website test/animexyz.test.js
git commit -m "feat: add AnimeXYZ demo website"
```

---

### Task 5: README, License, Lockfile, and Package Validation

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `package-lock.json` via npm
- Modify: `test/animexyz.test.js`

**Interfaces:**
- Documentation examples must use the exact implemented class and methods.

- [ ] **Step 1: Add documentation consistency tests**

Append:

```js
test('README documents package name, class, and website', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
  assert.match(readme, /animexyz-api/);
  assert.match(readme, /AnimeXYZ/);
  assert.match(readme, /streamProvider/);
  assert.match(readme, /website\//);
});
```

- [ ] **Step 2: Run tests and verify README test fails**

```bash
npm test
```

Expected: FAIL because `README.md` does not exist.

- [ ] **Step 3: Create README with exact implemented usage**

README must contain these sections and matching examples:

```markdown
# AnimeXYZ API

AnimeXYZ is a Node.js 18+ API client by **Jepong Devxyz**.

## Installation

```bash
npm install animexyz-api
```

## CommonJS

```js
const AnimeXYZ = require('animexyz-api');
const api = new AnimeXYZ({ baseUrl: 'https://your-api.example/v1' });
const results = await api.search('naruto', { page: 1, limit: 10 });
```

## ESM

```js
import AnimeXYZ, { AnimeXYZError } from 'animexyz-api';
```

## Available methods

`info()`, `home()`, `newEpisodes()`, `popular()`, `search()`, `fastSearch()`, `season()`, `anime()`, `stream()`.

## Custom stream provider

```js
const api = new AnimeXYZ({
  baseUrl: 'https://your-api.example/v1',
  streamProvider: async ({ id, episode }) => ({
    watchUrl: `https://your-authorized-provider.example/watch/${id}/${episode}`,
  }),
});
```

## Website

Static demo/docs files are in `website/`.

## License

MIT © Jepong Devxyz
```

Expand the README with method-by-method examples, error handling, TypeScript usage, Node requirement, and configuration while keeping all identifiers consistent with `index.js` and `index.d.ts`.

- [ ] **Step 4: Create MIT license**

Create `LICENSE` using the standard MIT license text with copyright line:

```text
Copyright (c) 2026 Jepong Devxyz
```

- [ ] **Step 5: Generate lockfile without adding runtime dependencies**

```bash
npm install --package-lock-only --ignore-scripts
```

Expected: `package-lock.json` created and no runtime dependencies added.

- [ ] **Step 6: Run complete package verification**

```bash
npm test
npm run pack:check
```

Expected: both commands succeed with zero test failures.

- [ ] **Step 7: Commit docs and package metadata**

```bash
git add README.md LICENSE package-lock.json test/animexyz.test.js
git commit -m "docs: complete AnimeXYZ package documentation"
```

---

### Task 6: GitHub Actions CI

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- CI must execute `npm ci`, `npm test`, and `npm run pack:check`.

- [ ] **Step 1: Create CI workflow**

```yaml
name: AnimeXYZ CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run pack:check
```

- [ ] **Step 2: Verify YAML and local commands**

Run:

```bash
npm test
npm run pack:check
```

Expected: PASS locally before relying on CI.

- [ ] **Step 3: Commit CI**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add AnimeXYZ verification workflow"
```

---

### Task 7: Final Verification and Repository Audit

**Files:**
- Verify all created files; modify only if verification reveals a defect.

**Interfaces:**
- Success criteria from the spec must all be satisfied.

- [ ] **Step 1: Run full verification**

```bash
npm test
npm run pack:check
```

Expected: zero failures and successful npm package dry run.

- [ ] **Step 2: Verify no Niheaven hard dependency exists**

```bash
grep -Rni "nimeheaven\|niheaven.vercel.app" index.js index.mjs index.d.ts package.json README.md website test || true
```

Expected: no runtime dependency/reference to Niheaven; explanatory historical text is unnecessary and should also be absent from product files.

- [ ] **Step 3: Verify website local references**

```bash
test -f website/index.html
test -f website/styles.css
test -f website/app.js
grep -q 'Powered by Jepong Devxyz' website/index.html
grep -q '3000' website/app.js
```

Expected: all commands succeed.

- [ ] **Step 4: Verify repository status is clean after commits**

```bash
git status --short
```

Expected: no output.

- [ ] **Step 5: Confirm GitHub Actions status for latest `main` commit**

Use the repository's Actions/commit status API and confirm the latest workflow run succeeds for the pushed commit. If a job fails, inspect its logs, fix the root cause with a new test where applicable, rerun local verification, commit, and push again.

- [ ] **Step 6: Final verification commit only if fixes were needed**

If verification required code changes:

```bash
git add -A
git commit -m "fix: resolve final AnimeXYZ verification issues"
```

If no fixes were needed, do not create an empty commit.
