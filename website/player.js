(function attachAnimeXYZPlayer(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AnimeXYZPlayer = api;
}(typeof window === 'object' ? window : null, function createPlayerModule(root) {
  'use strict';

  const PLAYBACK_TYPES = new Set(['mp4', 'hls', 'embed']);
  const FALLBACK_TYPES = new Set(['external', 'trailer']);
  const controllers = new Set();

  function fail(message) {
    throw new TypeError(message);
  }

  function normalizeAllowedEmbedHosts(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail('allowedEmbedHosts must be an array of hostnames');

    return value.map((host) => {
      if (typeof host !== 'string' || host.trim() === '') {
        fail('allowedEmbedHosts must contain non-empty hostname strings');
      }
      const normalized = host.trim().toLowerCase();
      let parsed;
      try {
        parsed = new URL(`https://${normalized}`);
      } catch {
        fail('allowedEmbedHosts contains an invalid hostname');
      }
      if (parsed.hostname !== normalized || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        fail('allowedEmbedHosts must contain hostnames without schemes, ports, or paths');
      }
      return normalized;
    });
  }

  function secureUrl(value, label) {
    if (typeof value !== 'string' || value.trim() === '') fail(`${label} URL is required`);
    let url;
    try {
      url = new URL(value);
    } catch {
      fail(`${label} URL is malformed`);
    }
    if (url.protocol !== 'https:') fail(`${label} URL must use HTTPS`);
    if (url.username || url.password) fail(`${label} URL must not include credentials`);
    return url;
  }

  function sourceName(value) {
    if (typeof value !== 'string' || value.trim() === '') fail('Playback source is required');
    return value.trim();
  }

  function validateResult(value, options) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('Stream result must be an object');
    }

    const allowedEmbedHosts = normalizeAllowedEmbedHosts(options?.allowedEmbedHosts);

    if (value.playable === true) {
      const playback = value.playback;
      if (!playback || typeof playback !== 'object' || Array.isArray(playback)) {
        fail('Playable stream result requires playback details');
      }
      if (!PLAYBACK_TYPES.has(playback.type)) fail('Playback type is not supported');
      const url = secureUrl(playback.url, 'Playback');
      if (playback.type === 'embed') {
        const hostname = url.hostname.toLowerCase();
        const allowed = allowedEmbedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
        if (!allowed) fail('Embed URL host is not allowlisted');
      }
      if (value.fallback !== null) fail('Playable stream result must not include a fallback');
      const title = playback.title === undefined || playback.title === null ? null : playback.title;
      if (title !== null && (typeof title !== 'string' || title.trim() === '')) {
        fail('Playback title must be a non-empty string or null');
      }
      return {
        playable: true,
        source: sourceName(value.source),
        playback: {
          type: playback.type,
          url: url.href,
          title: title === null ? null : title.trim(),
        },
        fallback: null,
      };
    }

    if (value.playable === false) {
      if (value.playback !== null) fail('Unavailable stream result must not include playback');
      const fallback = value.fallback;
      if (!fallback || typeof fallback !== 'object' || Array.isArray(fallback)) {
        fail('Unavailable stream result requires an official fallback');
      }
      if (!FALLBACK_TYPES.has(fallback.type)) fail('Fallback type is not supported');
      const url = secureUrl(fallback.url, 'Fallback');
      if (typeof fallback.label !== 'string' || fallback.label.trim() === '') {
        fail('Fallback label is required');
      }
      return {
        playable: false,
        source: sourceName(value.source),
        playback: null,
        fallback: {
          type: fallback.type,
          url: url.href,
          label: fallback.label.trim(),
        },
      };
    }

    fail('Stream result playable flag must be true or false');
  }

  function defaultElements() {
    const document = root?.document;
    if (!document) return {};
    return {
      video: document.getElementById('animeVideo'),
      iframe: document.getElementById('animeEmbed'),
      fallbackLink: document.getElementById('officialFallback'),
      retryButton: document.getElementById('playerRetry'),
      status: document.getElementById('playerStatus'),
    };
  }

  function createController(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const fetchImpl = settings.fetch || root?.fetch?.bind(root);
    if (typeof fetchImpl !== 'function') fail('createController requires fetch');

    const elements = { ...defaultElements(), ...(settings.elements || {}) };
    const allowedEmbedHosts = normalizeAllowedEmbedHosts(settings.allowedEmbedHosts);
    const apiBase = typeof settings.apiBase === 'string' ? settings.apiBase.replace(/\/+$/, '') : '';
    const timeout = settings.timeout === false
      ? false
      : (settings.timeout === undefined ? 15000 : settings.timeout);
    if (timeout !== false && (!Number.isFinite(timeout) || timeout < 0)) {
      fail('timeout must be a non-negative number or false');
    }

    let currentState = 'idle';
    let stateDetails = { state: 'idle', result: null, error: null };
    let activeRequest = null;
    let requestVersion = 0;
    let lastSelection = null;
    let destroyed = false;
    let suppressMediaEvents = false;
    const listeners = [];

    function setVisible(element, visible) {
      if (element) element.hidden = !visible;
    }

    function setUrl(element, attribute, value) {
      if (!element) return;
      if (value) element.setAttribute(attribute, value);
      else element.removeAttribute(attribute);
    }

    function clearSources() {
      suppressMediaEvents = true;
      try {
        if (elements.video) {
          if (typeof elements.video.pause === 'function') elements.video.pause();
          setUrl(elements.video, 'src', '');
          if (typeof elements.video.load === 'function') elements.video.load();
          setVisible(elements.video, false);
        }
        if (elements.iframe) {
          setUrl(elements.iframe, 'src', '');
          setVisible(elements.iframe, false);
        }
      } finally {
        suppressMediaEvents = false;
      }
    }

    function clearFallback() {
      if (!elements.fallbackLink) return;
      setUrl(elements.fallbackLink, 'href', '');
      elements.fallbackLink.textContent = '';
      setVisible(elements.fallbackLink, false);
    }

    function statusMessage(state, detail) {
      if (state === 'idle') return 'Choose a title and episode.';
      if (state === 'loading') return 'Loading authorized playback…';
      if (state === 'ready') return 'Playback is ready.';
      if (state === 'playing') return 'Playing.';
      if (state === 'paused') return 'Playback paused.';
      if (state === 'unavailable') return 'Direct playback is unavailable. An official link is available.';
      if (state === 'cancelled') return 'Playback request cancelled.';
      return detail?.error?.message || 'Playback could not be loaded.';
    }

    function transition(state, detail) {
      currentState = state;
      stateDetails = {
        state,
        result: detail?.result || null,
        error: detail?.error || null,
      };
      if (elements.status) elements.status.textContent = statusMessage(state, stateDetails);
      setVisible(elements.retryButton, state === 'error');
      if (typeof settings.onStateChange === 'function') settings.onStateChange({ ...stateDetails });
    }

    function listen(element, event, listener) {
      if (!element?.addEventListener) return;
      element.addEventListener(event, listener);
      listeners.push(() => element.removeEventListener(event, listener));
    }

    listen(elements.video, 'playing', () => {
      if (!suppressMediaEvents && (currentState === 'ready' || currentState === 'paused')) {
        transition('playing', { result: stateDetails.result });
      }
    });
    listen(elements.video, 'pause', () => {
      if (!suppressMediaEvents && (currentState === 'ready' || currentState === 'playing')) {
        transition('paused', { result: stateDetails.result });
      }
    });
    const mediaError = () => {
      if (!suppressMediaEvents && ['ready', 'playing', 'paused'].includes(currentState)) {
        transition('error', { result: stateDetails.result, error: new Error('Playback media failed') });
      }
    };
    listen(elements.video, 'error', mediaError);
    listen(elements.iframe, 'error', mediaError);
    listen(elements.retryButton, 'click', () => { void retry(); });

    function abortActive() {
      if (!activeRequest) return false;
      const request = activeRequest;
      activeRequest = null;
      if (request.timer) clearTimeout(request.timer);
      request.controller.abort();
      return true;
    }

    function cancel() {
      requestVersion += 1;
      abortActive();
      clearSources();
      clearFallback();
      transition('cancelled');
    }

    function attach(result) {
      if (result.playable) {
        if (result.playback.type === 'hls') {
          const supportsHls = typeof elements.video?.canPlayType === 'function'
            && Boolean(
              elements.video.canPlayType('application/vnd.apple.mpegurl')
              || elements.video.canPlayType('application/x-mpegURL'),
            );
          if (!supportsHls) {
            clearSources();
            if (settings.hlsFallback !== undefined) {
              const fallbackResult = validateResult({
                playable: false,
                source: result.source,
                playback: null,
                fallback: settings.hlsFallback,
              });
              attach(fallbackResult);
              return fallbackResult;
            }
            transition('error', {
              result,
              error: new Error('HLS playback is not supported by this browser'),
            });
            return null;
          }
        }
        if (result.playback.type === 'embed') {
          setUrl(elements.iframe, 'src', result.playback.url);
          setVisible(elements.iframe, true);
          setVisible(elements.video, false);
        } else {
          setUrl(elements.video, 'src', result.playback.url);
          setVisible(elements.video, true);
          setVisible(elements.iframe, false);
          if (typeof elements.video?.load === 'function') elements.video.load();
        }
        transition('ready', { result });
        return result;
      }

      setUrl(elements.fallbackLink, 'href', result.fallback.url);
      if (elements.fallbackLink) elements.fallbackLink.textContent = result.fallback.label;
      setVisible(elements.fallbackLink, true);
      transition('unavailable', { result });
      return result;
    }

    async function load(id, episode) {
      if (destroyed) fail('Player controller has been destroyed');
      if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === '') {
        fail('id is required');
      }
      if ((typeof episode !== 'string' && typeof episode !== 'number') || String(episode).trim() === '') {
        fail('episode is required');
      }

      lastSelection = { id: String(id), episode: String(episode) };
      if (abortActive()) transition('cancelled');
      const version = ++requestVersion;
      clearSources();
      clearFallback();
      transition('loading');

      const controller = new AbortController();
      const request = { controller, timer: null, version, timedOut: false, removeAbortListener: null };
      activeRequest = request;
      const interrupted = new Promise((resolve, reject) => {
        const onAbort = () => reject(
          controller.signal.reason instanceof Error
            ? controller.signal.reason
            : Object.assign(new Error('Playback request cancelled'), { name: 'AbortError' }),
        );
        controller.signal.addEventListener('abort', onAbort, { once: true });
        request.removeAbortListener = () => controller.signal.removeEventListener('abort', onAbort);
      });
      if (timeout !== false) {
        request.timer = setTimeout(() => {
          request.timedOut = true;
          controller.abort(new Error('Playback request timed out'));
        }, timeout);
      }

      const url = `${apiBase}/stream/${encodeURIComponent(lastSelection.id)}/${encodeURIComponent(lastSelection.episode)}`;
      try {
        let fetchRequest;
        try {
          fetchRequest = Promise.resolve(fetchImpl(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }));
        } catch (error) {
          fetchRequest = Promise.reject(error);
        }
        const resultRequest = fetchRequest.then(async (response) => {
          if (!response || response.ok !== true) {
            throw new Error(`Playback request failed${response?.status ? ` with status ${response.status}` : ''}`);
          }
          return response.json();
        });
        const value = await Promise.race([
          resultRequest,
          interrupted,
        ]);
        if (version !== requestVersion || destroyed) return null;
        if (request.timedOut) throw new Error('Playback request timed out');
        if (controller.signal.aborted) throw controller.signal.reason || new Error('Playback request cancelled');
        const result = validateResult(value, { allowedEmbedHosts });
        return attach(result);
      } catch (error) {
        if (version !== requestVersion || destroyed) return null;
        if (request.timedOut) {
          clearSources();
          transition('error', { error: new Error('Playback request timed out') });
          return null;
        }
        if (controller.signal.aborted || error?.name === 'AbortError') {
          transition('cancelled');
          return null;
        }
        clearSources();
        transition('error', { error: error instanceof Error ? error : new Error(String(error)) });
        return null;
      } finally {
        if (request.timer) clearTimeout(request.timer);
        if (request.removeAbortListener) request.removeAbortListener();
        if (activeRequest === request) activeRequest = null;
      }
    }

    function retry() {
      if (!lastSelection) return Promise.resolve(null);
      return load(lastSelection.id, lastSelection.episode);
    }

    function destroyController() {
      if (destroyed) return;
      cancel();
      destroyed = true;
      for (const remove of listeners.splice(0)) remove();
      controllers.delete(controllerApi);
    }

    const controllerApi = {
      load,
      retry,
      cancel,
      destroy: destroyController,
      get state() { return currentState; },
      get current() { return { ...stateDetails }; },
      get destroyed() { return destroyed; },
    };

    controllers.add(controllerApi);
    return controllerApi;
  }

  function destroy(controller) {
    if (controller !== undefined) {
      if (!controller || typeof controller.destroy !== 'function') fail('destroy requires a player controller');
      controller.destroy();
      return;
    }
    for (const active of Array.from(controllers)) active.destroy();
  }

  if (root?.addEventListener) {
    const cleanup = () => destroy();
    root.addEventListener('pagehide', cleanup);
    root.addEventListener('beforeunload', cleanup);
  }

  return Object.freeze({ validateResult, createController, destroy });
}));
