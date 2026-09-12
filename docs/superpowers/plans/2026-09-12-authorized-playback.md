# AnimeXYZ Authorized Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated authorized playback results and a responsive browser player without claiming unavailable media is playable.

**Architecture:** The package normalizes provider output at the `stream()` boundary into playback or official-fallback results. The static website consumes the same contract through a configurable API base, validates browser-facing URLs again, and renders a finite player state machine.

**Tech Stack:** Node.js 18+, CommonJS/ESM, TypeScript declarations, Node test runner, framework-free HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-12-authorized-playback-design.md`

## Global Constraints

- Only explicit authorized provider responses may become playable media.
- Require HTTPS and reject credentials, unsafe schemes, unknown source types, and unapproved embed hosts.
- Do not bypass DRM, access controls, geographic restrictions, or subscription controls.
- Preserve the exact `Powered by Jepong Devxyz` toast.
- Keep Niheaven and MAL identifiers separate.
- Support Node.js 18, 20, and 22.

---

### Task 1: Playback result contract

**Files:**
- Modify: `test/animexyz.test.js`
- Modify: `index.js`
- Modify: `index.d.ts`
- Modify: `index.mjs`

**Interfaces:**
- Consumes: existing `streamProvider({ id, episode, options, client })`
- Produces: `normalizePlaybackResult(value, options)` and normalized `{ playable, source, playback, fallback }`

- [ ] **Step 1: Write failing tests for valid results**

```js
test('normalizes an authorized MP4 provider response', async () => {
  const api = new AnimeXYZ({
    fetch: async () => jsonResponse({}),
    streamProvider: async () => ({ source: 'licensed', type: 'mp4', url: 'https://media.example/ep1.mp4' }),
  });
  assert.deepEqual(await api.stream('show', 1), {
    playable: true,
    source: 'licensed',
    playback: { type: 'mp4', url: 'https://media.example/ep1.mp4', title: null },
    fallback: null,
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because raw provider output is returned**

Run: `node --test --test-name-pattern="normalizes an authorized MP4"`

- [ ] **Step 3: Add minimal normalization**

```js
function normalizePlaybackResult(value, options = {}) {
  // Validate the provider object, HTTPS URL, known type, credentials,
  // and embed host before returning the normalized contract.
}
```

- [ ] **Step 4: Add failing tests for HLS, trailer/external fallback, allowlisted embed, unsafe URL, unknown type, credentials, malformed response, and empty availability**

Each rejection must assert `AnimeXYZError.code` exactly: `INVALID_STREAM_RESPONSE` or `STREAM_UNAVAILABLE`.

- [ ] **Step 5: Implement only the validation required by those tests**

Constructor option `allowedEmbedHosts` must be a string array normalized to lowercase hostnames. `embed` must match it exactly or as a subdomain boundary.

- [ ] **Step 6: Update declarations and ESM named exports**

Declare `AnimeXYZPlaybackType`, `AnimeXYZPlayback`, `AnimeXYZPlaybackFallback`, and `AnimeXYZStreamResult`; add `allowedEmbedHosts?: string[]` to constructor options.

- [ ] **Step 7: Run the entire package test suite**

Run: `npm test`

### Task 2: Browser playback controller

**Files:**
- Create: `website/player.js`
- Create: `test/player.test.js`
- Modify: `website/index.html`

**Interfaces:**
- Consumes: normalized stream result from `GET {apiBase}/stream/:id/:episode`
- Produces: `window.AnimeXYZPlayer` with `validateResult`, `createController`, and `destroy`

- [ ] **Step 1: Write failing Node tests for browser-independent validation and state transitions**

```js
test('player rejects a non-HTTPS media URL', () => {
  assert.throws(() => player.validateResult({
    playable: true,
    playback: { type: 'mp4', url: 'http://media.example/a.mp4' },
  }), /HTTPS/);
});
```

- [ ] **Step 2: Run `node --test test/player.test.js` and confirm the missing module failure**

- [ ] **Step 3: Implement the finite state controller**

Implement `idle`, `loading`, `ready`, `playing`, `paused`, `unavailable`, `error`, and `cancelled`. A new load aborts the previous request and clears video/iframe sources.

- [ ] **Step 4: Add the semantic player HTML**

Add search form, status live region, result list, episode selector, video element, sandboxed iframe, official fallback link, retry button, and config script before `player.js` and `app.js`.

- [ ] **Step 5: Re-run focused and full tests**

Run: `node --test test/player.test.js && npm test`

### Task 3: Responsive interactive website

**Files:**
- Modify: `website/app.js`
- Modify: `website/styles.css`
- Modify: `test/animexyz.test.js`

**Interfaces:**
- Consumes: `window.ANIMEXYZ_CONFIG` and `window.AnimeXYZPlayer`
- Produces: search/result/episode event handling and accessible status messages

- [ ] **Step 1: Add failing static tests**

Assert the player script exists, the video has controls, iframe has a restrictive sandbox, every form control has a label, and the exact toast text remains present.

- [ ] **Step 2: Run the website-focused tests and confirm the expected failures**

Run: `node --test --test-name-pattern="website|player"`

- [ ] **Step 3: Implement search, title selection, episode selection, retry, and fallback-link rendering**

Use `textContent` for remote text, `URL` validation for links, `AbortController` for replacement requests, and no inline remote HTML.

- [ ] **Step 4: Add responsive player CSS**

Use a single column below 820px, `aspect-ratio: 16 / 9`, scrollable episode controls, minimum 44px targets, and overflow-safe text.

- [ ] **Step 5: Run all tests and syntax checks**

Run: `npm test && node --check index.js && node --check website/player.js && node --check website/app.js`

### Task 4: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-12-animexyz-design.md`

**Interfaces:**
- Consumes: final public contract
- Produces: configuration examples and accurate limitations

- [ ] **Step 1: Document the authorized provider contract, embed allowlist, browser configuration, errors, and unsupported cases**

- [ ] **Step 2: Run fresh complete verification**

Run: `npm test && npm run pack:check && node --check index.js && node --check index.mjs && node --check website/player.js && node --check website/app.js`

- [ ] **Step 3: Run browser verification with a legal public MP4**

Confirm load, `playing`, pause, source replacement, broken-source error, official-link fallback, and phone/desktop layouts. Record the exact environment and results.

- [ ] **Step 4: Push the verified files to the draft branch**

Use a fast-forward commit based on the latest remote branch head. Keep PR #1 in draft state.

- [ ] **Step 5: Verify GitHub Actions**

Confirm Node.js 18, 20, and 22 jobs complete successfully before reporting them as passing. Report any live provider failure separately from deterministic tests.

