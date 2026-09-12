'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const player = require('../website/player.js');

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = true;
    this.textContent = '';
    this.src = '';
    this.href = '';
    this.loadCalls = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type, target: this });
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'src') this.src = String(value);
    if (name === 'href') this.href = String(value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'src') this.src = '';
    if (name === 'href') this.href = '';
  }

  load() {
    this.loadCalls += 1;
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function elements() {
  return {
    video: new FakeElement(),
    iframe: new FakeElement(),
    fallbackLink: new FakeElement(),
    retryButton: new FakeElement(),
    status: new FakeElement(),
  };
}

test('player rejects a non-HTTPS media URL', () => {
  assert.throws(() => player.validateResult({
    playable: true,
    playback: { type: 'mp4', url: 'http://media.example/a.mp4' },
  }), /HTTPS/);
});

test('player validation accepts authorized direct media and official fallbacks', () => {
  assert.deepEqual(player.validateResult({
    playable: true,
    source: 'licensed',
    playback: { type: 'mp4', url: 'https://media.example/a.mp4', title: 'Episode 1' },
    fallback: null,
  }), {
    playable: true,
    source: 'licensed',
    playback: { type: 'mp4', url: 'https://media.example/a.mp4', title: 'Episode 1' },
    fallback: null,
  });

  assert.deepEqual(player.validateResult({
    playable: false,
    source: 'metadata',
    playback: null,
    fallback: { type: 'external', url: 'https://official.example/watch', label: 'Official site' },
  }), {
    playable: false,
    source: 'metadata',
    playback: null,
    fallback: { type: 'external', url: 'https://official.example/watch', label: 'Official site' },
  });
});

test('player rejects credentials, unknown types, and unapproved embed hosts', () => {
  for (const value of [
    {
      playable: true,
      source: 'licensed',
      playback: { type: 'mp4', url: 'https://user:secret@media.example/a.mp4', title: null },
      fallback: null,
    },
    {
      playable: true,
      source: 'licensed',
      playback: { type: 'dash', url: 'https://media.example/a.mpd', title: null },
      fallback: null,
    },
    {
      playable: true,
      source: 'licensed',
      playback: { type: 'embed', url: 'https://evil-player.example/embed/1', title: null },
      fallback: null,
    },
  ]) {
    assert.throws(() => player.validateResult(value, { allowedEmbedHosts: ['safe-player.example'] }));
  }
});

test('embed allowlist accepts subdomains and rejects suffix-confusion hosts', () => {
  const result = player.validateResult({
    playable: true,
    source: 'licensed',
    playback: { type: 'embed', url: 'https://sub.safe-player.example/embed/1', title: null },
    fallback: null,
  }, { allowedEmbedHosts: ['safe-player.example'] });
  assert.equal(result.playback.url, 'https://sub.safe-player.example/embed/1');

  assert.throws(() => player.validateResult({
    playable: true,
    source: 'licensed',
    playback: { type: 'embed', url: 'https://evilsafe-player.example/embed/1', title: null },
    fallback: null,
  }, { allowedEmbedHosts: ['safe-player.example'] }), /allowlisted/);
});

test('controller loads MP4 and follows ready, playing, and paused states', async () => {
  const ui = elements();
  const states = [];
  const controller = player.createController({
    apiBase: 'https://api.example/v1/',
    elements: ui,
    fetch: async (url) => {
      assert.equal(url, 'https://api.example/v1/stream/show%2Fone/2');
      return jsonResponse({
        playable: true,
        source: 'licensed',
        playback: { type: 'mp4', url: 'https://media.example/a.mp4', title: null },
        fallback: null,
      });
    },
    onStateChange: ({ state }) => states.push(state),
  });

  await controller.load('show/one', 2);
  assert.equal(controller.state, 'ready');
  assert.equal(ui.video.src, 'https://media.example/a.mp4');
  assert.equal(ui.video.hidden, false);
  assert.equal(ui.iframe.hidden, true);

  ui.video.dispatch('playing');
  assert.equal(controller.state, 'playing');
  ui.video.dispatch('pause');
  assert.equal(controller.state, 'paused');
  assert.deepEqual(states, ['loading', 'ready', 'playing', 'paused']);

  controller.destroy();
});

test('a replacement load aborts the old request and clears stale media', async () => {
  const ui = elements();
  let firstSignal;
  let resolveFirst;
  const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });
  const controller = player.createController({
    apiBase: 'https://api.example',
    elements: ui,
    fetch: async (url, options) => {
      if (url.endsWith('/1')) {
        firstSignal = options.signal;
        return firstResponse;
      }
      return jsonResponse({
        playable: true,
        source: 'licensed',
        playback: { type: 'embed', url: 'https://player.example/embed/2', title: null },
        fallback: null,
      });
    },
    allowedEmbedHosts: ['player.example'],
  });

  const firstLoad = controller.load('show', 1);
  const secondLoad = controller.load('show', 2);
  assert.equal(firstSignal.aborted, true);
  await secondLoad;
  assert.equal(controller.state, 'ready');
  assert.equal(ui.video.src, '');
  assert.equal(ui.iframe.src, 'https://player.example/embed/2');

  resolveFirst(jsonResponse({
    playable: true,
    source: 'licensed',
    playback: { type: 'mp4', url: 'https://media.example/stale.mp4', title: null },
    fallback: null,
  }));
  await firstLoad;
  assert.equal(ui.video.src, '');
  assert.equal(ui.iframe.src, 'https://player.example/embed/2');

  controller.destroy();
});

test('controller exposes unavailable, error, cancelled, retry, and destroy behavior', async () => {
  const ui = elements();
  let calls = 0;
  const controller = player.createController({
    elements: ui,
    fetch: async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({
          playable: false,
          source: 'metadata',
          playback: null,
          fallback: { type: 'trailer', url: 'https://official.example/trailer', label: 'Watch trailer' },
        });
      }
      return jsonResponse({ malformed: true });
    },
  });

  await controller.load('show', 1);
  assert.equal(controller.state, 'unavailable');
  assert.equal(ui.fallbackLink.href, 'https://official.example/trailer');
  assert.equal(ui.fallbackLink.hidden, false);

  await controller.retry();
  assert.equal(controller.state, 'error');
  assert.equal(ui.retryButton.hidden, false);

  controller.cancel();
  assert.equal(controller.state, 'cancelled');
  assert.equal(ui.video.src, '');
  assert.equal(ui.iframe.src, '');

  controller.destroy();
  assert.equal(controller.destroyed, true);
  assert.equal(controller.state, 'cancelled');
});

test('controller enforces its timeout when fetch ignores AbortSignal', async () => {
  const ui = elements();
  const controller = player.createController({
    elements: ui,
    timeout: 5,
    fetch: async () => new Promise(() => {}),
  });

  await Promise.race([
    controller.load('show', 1),
    new Promise((_, reject) => setTimeout(() => reject(new Error('load did not settle')), 75)),
  ]);

  assert.equal(controller.state, 'error');
  assert.match(ui.status.textContent, /timed out/i);
  controller.destroy();
});

test('controller timeout governs JSON body parsing that never settles', async () => {
  const ui = elements();
  const controller = player.createController({
    elements: ui,
    timeout: 5,
    fetch: async () => ({ ok: true, status: 200, json: async () => new Promise(() => {}) }),
  });

  await Promise.race([
    controller.load('show', 1),
    new Promise((_, reject) => setTimeout(() => reject(new Error('body parsing did not settle')), 75)),
  ]);

  assert.equal(controller.state, 'error');
  assert.match(ui.status.textContent, /timed out/i);
  controller.destroy();
});

test('a JSON body resolving after timeout cannot attach playback', async () => {
  const ui = elements();
  let resolveBody;
  const body = new Promise((resolve) => { resolveBody = resolve; });
  const controller = player.createController({
    elements: ui,
    timeout: 5,
    fetch: async () => ({ ok: true, status: 200, json: async () => body }),
  });

  await Promise.race([
    controller.load('show', 1),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed-out body did not settle')), 75)),
  ]);
  assert.equal(controller.state, 'error');

  resolveBody({
    playable: true,
    source: 'licensed',
    playback: { type: 'mp4', url: 'https://media.example/late.mp4', title: null },
    fallback: null,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.state, 'error');
  assert.equal(ui.video.src, '');
  controller.destroy();
});

test('replacement and destroy settle loads waiting on JSON body parsing', async () => {
  for (const action of ['replace', 'destroy']) {
    const ui = elements();
    let markBodyStarted;
    const bodyStarted = new Promise((resolve) => { markBodyStarted = resolve; });
    let resolveBody;
    const body = new Promise((resolve) => { resolveBody = resolve; });
    let calls = 0;
    const controller = player.createController({
      elements: ui,
      timeout: false,
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => {
              markBodyStarted();
              return body;
            },
          };
        }
        return jsonResponse({
          playable: true,
          source: 'licensed',
          playback: { type: 'mp4', url: 'https://media.example/new.mp4', title: null },
          fallback: null,
        });
      },
    });

    const oldLoad = controller.load('show', 1);
    await bodyStarted;
    if (action === 'replace') await controller.load('show', 2);
    else controller.destroy();
    await Promise.race([
      oldLoad,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${action} did not settle old body`)), 75)),
    ]);

    resolveBody({
      playable: true,
      source: 'licensed',
      playback: { type: 'mp4', url: 'https://media.example/stale.mp4', title: null },
      fallback: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (action === 'replace') {
      assert.equal(controller.state, 'ready');
      assert.equal(ui.video.src, 'https://media.example/new.mp4');
      controller.destroy();
    } else {
      assert.equal(controller.destroyed, true);
      assert.equal(ui.video.src, '');
    }
  }
});

test('unsupported native HLS uses an official fallback when configured', async () => {
  const ui = elements();
  ui.video.canPlayType = () => '';
  const controller = player.createController({
    elements: ui,
    hlsFallback: {
      type: 'external',
      url: 'https://official.example/watch',
      label: 'Watch on official provider',
    },
    fetch: async () => jsonResponse({
      playable: true,
      source: 'licensed',
      playback: { type: 'hls', url: 'https://media.example/episode.m3u8', title: null },
      fallback: null,
    }),
  });

  await controller.load('show', 1);
  assert.equal(controller.state, 'unavailable');
  assert.equal(ui.video.src, '');
  assert.equal(ui.fallbackLink.href, 'https://official.example/watch');
  controller.destroy();
});

test('unsupported native HLS reports error instead of ready without a fallback', async () => {
  const ui = elements();
  ui.video.canPlayType = () => '';
  const controller = player.createController({
    elements: ui,
    fetch: async () => jsonResponse({
      playable: true,
      source: 'licensed',
      playback: { type: 'hls', url: 'https://media.example/episode.m3u8', title: null },
      fallback: null,
    }),
  });

  await controller.load('show', 1);
  assert.equal(controller.state, 'error');
  assert.equal(ui.video.src, '');
  assert.match(ui.status.textContent, /HLS/i);
  controller.destroy();
});

test('native HLS is attached only when the video element reports support', async () => {
  const ui = elements();
  ui.video.canPlayType = (type) => type === 'application/vnd.apple.mpegurl' ? 'maybe' : '';
  const controller = player.createController({
    elements: ui,
    fetch: async () => jsonResponse({
      playable: true,
      source: 'licensed',
      playback: { type: 'hls', url: 'https://media.example/episode.m3u8', title: null },
      fallback: null,
    }),
  });

  await controller.load('show', 1);
  assert.equal(controller.state, 'ready');
  assert.equal(ui.video.src, 'https://media.example/episode.m3u8');
  controller.destroy();
});

test('media errors transition to error and listeners are removed on destroy', async () => {
  const ui = elements();
  const controller = player.createController({
    elements: ui,
    fetch: async () => jsonResponse({
      playable: true,
      source: 'licensed',
      playback: { type: 'mp4', url: 'https://media.example/a.mp4', title: null },
      fallback: null,
    }),
  });
  await controller.load('show', 1);
  ui.video.dispatch('error');
  assert.equal(controller.state, 'error');
  controller.destroy();
  ui.video.dispatch('playing');
  assert.equal(controller.state, 'cancelled');
  assert.equal(ui.video.listeners.get('playing').size, 0);
});

test('iframe errors transition an attached embed to error', async () => {
  const ui = elements();
  const controller = player.createController({
    elements: ui,
    allowedEmbedHosts: ['player.example'],
    fetch: async () => jsonResponse({
      playable: true,
      source: 'licensed',
      playback: { type: 'embed', url: 'https://player.example/embed/1', title: null },
      fallback: null,
    }),
  });
  await controller.load('show', 1);
  ui.iframe.dispatch('error');
  assert.equal(controller.state, 'error');
  controller.destroy();
});

test('top-level destroy tears down every controller created by the module', () => {
  const first = player.createController({
    elements: elements(),
    fetch: async () => jsonResponse({}),
  });
  const second = player.createController({
    elements: elements(),
    fetch: async () => jsonResponse({}),
  });
  player.destroy();
  assert.equal(first.destroyed, true);
  assert.equal(second.destroyed, true);
});

test('pagehide and beforeunload share lifecycle cleanup for active controllers', async () => {
  const moduleSource = fs.readFileSync(path.resolve(__dirname, '../website/player.js'), 'utf8');
  const lifecycleListeners = new Map();
  const browserWindow = {
    document: { getElementById: () => null },
    fetch: async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })));
    }),
    addEventListener(type, listener) {
      lifecycleListeners.set(type, listener);
    },
  };
  vm.runInNewContext(moduleSource, {
    window: browserWindow,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
  });

  assert.equal(typeof lifecycleListeners.get('pagehide'), 'function');
  assert.equal(lifecycleListeners.get('pagehide'), lifecycleListeners.get('beforeunload'));
  const ui = elements();
  const controller = browserWindow.AnimeXYZPlayer.createController({ elements: ui, timeout: false });
  const pending = controller.load('show', 1);
  lifecycleListeners.get('pagehide')();
  await pending;
  assert.equal(controller.destroyed, true);
  assert.equal(ui.video.src, '');
  assert.equal(ui.iframe.src, '');
});

test('website includes semantic playback controls and ordered scripts', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../website/index.html'), 'utf8');

  assert.match(html, /<form[^>]+id=["']searchForm["']/i);
  assert.match(html, /<label[^>]+for=["']searchQuery["']/i);
  assert.match(html, /id=["']playerStatus["'][^>]+aria-live=["']polite["']/i);
  assert.match(html, /<(?:ul|ol)[^>]+id=["']searchResults["']/i);
  assert.match(html, /<label[^>]+for=["']episodeSelect["']/i);
  assert.match(html, /<select[^>]+id=["']episodeSelect["']/i);
  assert.match(html, /<video[^>]+id=["']animeVideo["'][^>]+controls/i);
  const iframeTag = html.match(/<iframe\b[\s\S]*?>/i)?.[0];
  assert.ok(iframeTag);
  const sandbox = iframeTag.match(/\bsandbox=["']([^"']*)["']/i)?.[1].trim().split(/\s+/).sort();
  assert.deepEqual(sandbox, ['allow-presentation', 'allow-scripts']);
  assert.match(html, /<a[^>]+id=["']officialFallback["']/i);
  assert.match(html, /<button[^>]+id=["']playerRetry["']/i);

  const configAt = html.indexOf('window.ANIMEXYZ_CONFIG');
  const playerAt = html.indexOf('./player.js');
  const appAt = html.indexOf('./app.js');
  assert.ok(configAt >= 0 && configAt < playerAt && playerAt < appAt);
  const toastContents = html.match(/<div[^>]+id=["']poweredToast["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  assert.ok(toastContents);
  assert.equal(toastContents.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 'Powered by Jepong Devxyz');
});

test('website app wires search results and episode selection to the player', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../website/app.js'), 'utf8');
  assert.match(app, /searchForm/);
  assert.match(app, /searchResults/);
  assert.match(app, /episodeSelect/);
  assert.match(app, /AnimeXYZPlayer/);
  assert.match(app, /AbortController/);
});
