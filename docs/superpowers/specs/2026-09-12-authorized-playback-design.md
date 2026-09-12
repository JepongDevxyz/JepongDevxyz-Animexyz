# AnimeXYZ Authorized Playback Design

Date: 2026-09-12
Owner: JepongDevxyz
Repository: JepongDevxyz/JepongDevxyz-Animexyz

## Goal

Add a real browser playback flow for media returned by an explicitly configured authorized provider. The application must never manufacture stream URLs, scrape protected players, bypass DRM, or label unavailable media as playable.

## Scope

The change adds:

- a normalized playback-source contract for the Node.js client
- strict HTTPS URL and source-type validation
- support for direct MP4, browser-native HLS, and approved embed URLs
- a responsive website search, title, episode, and player flow
- loading, cancellation, timeout, empty, unavailable, and playback-error states
- official watch-link and trailer fallback when no authorized stream exists
- automated package and static website tests
- browser playback verification with a legal public sample video

The exact `Powered by Jepong Devxyz` load toast remains unchanged.

## Provider Boundary

`streamProvider` is the only extension point allowed to return playable media. It receives the existing `{ id, episode, options, client }` context and may return:

```js
{
  source: 'authorized-provider',
  type: 'mp4',
  url: 'https://media.example/video.mp4',
  title: 'Episode 1',
  headers: undefined
}
```

Supported `type` values are:

- `mp4`: direct HTTPS video URL
- `hls`: HTTPS HLS manifest for browsers with native HLS support
- `embed`: HTTPS page allowed by the application-configured embed-host allowlist
- `external`: official HTTPS viewing page opened as a normal link
- `trailer`: official HTTPS trailer page or playable trailer URL

The package will normalize compatible existing provider responses but will reject ambiguous objects that contain no valid HTTPS URL. Request headers are not exposed to the browser player; providers needing secrets must proxy authorized playback from their own backend.

## Validation and Security

Playback normalization will:

- require `https:` URLs
- reject credentials in URLs
- reject `javascript:`, `data:`, `blob:`, local-file, and cleartext HTTP URLs
- accept only known source types
- require an explicit allowed host for `embed`
- preserve caller cancellation and the configured request timeout
- return a structured `INVALID_STREAM_RESPONSE` error for malformed provider output
- return `STREAM_UNAVAILABLE` when no authorized source or official fallback exists

No code will inspect protected player pages, decrypt manifests, copy session cookies, generate signatures, or work around geographic or subscription controls.

## Package API

`stream()` keeps its existing signature. A successful response is normalized to:

```js
{
  playable: true,
  source: 'authorized-provider',
  playback: {
    type: 'mp4',
    url: 'https://media.example/video.mp4',
    title: 'Episode 1'
  },
  fallback: null
}
```

When direct playback is unavailable but an official destination exists:

```js
{
  playable: false,
  source: 'metadata',
  playback: null,
  fallback: {
    type: 'external',
    url: 'https://official.example/title',
    label: 'Watch on official provider'
  }
}
```

The TypeScript declarations will export the playback source, normalized result, fallback, and provider context types.

## Website Flow

The static website becomes an interactive demo that can be connected to an AnimeXYZ-compatible backend through configuration. It will provide:

1. Search form with a safe query and visible loading state.
2. Result cards showing title, image, source, and provider availability.
3. Title view with episode selector when the backend supplies episodes.
4. Player surface for MP4 or native HLS.
5. Sandboxed iframe only for an embed host included in configuration.
6. Official-link or trailer action when direct playback is unavailable.
7. Retry and readable error state after a network or media failure.

The UI will not show a working Play label unless the normalized response has `playable: true`.

## Player State Model

The player uses these states:

- `idle`: nothing selected
- `loading`: stream lookup in progress
- `ready`: validated source attached
- `playing`: the media element emitted `playing`
- `paused`: playback paused after readiness
- `unavailable`: official fallback is available but direct playback is not
- `error`: request validation, timeout, network, embed, or media error
- `cancelled`: a newer selection or user action cancelled the request

Selecting another episode aborts the active lookup, removes the old media source, and starts a new lookup. Cleanup also runs on page unload.

## Failure Handling

- Metadata failure shows a retryable search error.
- Stream lookup timeout shows a timeout-specific message.
- Invalid provider output is never attached to a player.
- Unsupported HLS shows the official fallback rather than claiming playback.
- Media-element failure moves to `error` and keeps any official fallback visible.
- Cancellation is silent when caused by selecting another title or episode.

## Testing

Package tests will first fail, then verify:

- valid MP4, HLS, external, trailer, and allowlisted embed normalization
- rejection of unsafe schemes, credentials, unknown types, and unapproved embed hosts
- `INVALID_STREAM_RESPONSE` and `STREAM_UNAVAILABLE` errors
- timeout and caller cancellation behavior
- compatibility with the existing `streamProvider` callback

Website tests will verify required controls, accessible labels, the exact powered-by toast, responsive assets, safe iframe attributes, and no missing local references.

Browser verification will use a legal public sample MP4 and will confirm load, play event, pause, source replacement, failure UI, mobile layout, and fallback-link behavior. Live provider-specific success can only be claimed when an authorized provider returns an accessible source during the test.

## Acceptance Criteria

- All existing and new tests pass on Node.js 18, 20, and 22.
- Package dry-run and JavaScript syntax checks pass.
- Unsafe playback URLs are rejected before reaching the browser.
- A legal public sample video reaches the `playing` state in browser verification.
- Missing or failed provider media displays an honest official-link or trailer fallback.
- The UI has no overlapping controls at phone and desktop widths.
- The exact `Powered by Jepong Devxyz` toast still appears on every page load.
- Documentation states that playable anime requires a configured authorized provider.

