'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const toast = document.getElementById('poweredToast');
  if (toast) {
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => toast.classList.remove('show'), 3000);
  }
  const config = window.ANIMEXYZ_CONFIG || {};
  const form = document.getElementById('searchForm');
  const queryInput = document.getElementById('searchQuery');
  const resultsList = document.getElementById('searchResults');
  const episodeSelect = document.getElementById('episodeSelect');
  const status = document.getElementById('playerStatus');
  if (!form || !queryInput || !resultsList || !episodeSelect || !status || !window.AnimeXYZPlayer) return;

  const player = window.AnimeXYZPlayer.createController({
    apiBase: config.apiBase,
    allowedEmbedHosts: config.allowedEmbedHosts || [],
    timeout: config.timeout,
    hlsFallback: config.hlsFallback,
  });
  let selected = null;
  let searchController = null;
  const setStatus = (message) => { status.textContent = message; };
  const itemsFrom = (value) => Array.isArray(value) ? value
    : (Array.isArray(value?.results) ? value.results : (Array.isArray(value?.data) ? value.data : []));
  const titleOf = (item) => item?.title || item?.name || item?.title_english || item?.englishTitle || 'Untitled anime';
  const idOf = (item) => item?.niheavenId || item?.niheaven_id || item?.id || item?.malId || item?.mal_id || null;
  const officialLinksOf = (item) => (Array.isArray(item?.officialLinks) ? item.officialLinks : []).filter((link) => {
    try {
      const url = new URL(link?.url);
      return url.protocol === 'https:' && !/(^|\.)youtube\.com$/i.test(url.hostname);
    } catch { return false; }
  });
  const episodesOf = (item) => {
    const episodes = item?.episodes || item?.episodeList || item?.data?.episodes;
    if (!Array.isArray(episodes)) return [];
    return episodes.map((episode, index) => {
      if (typeof episode === 'string' || typeof episode === 'number') return { id: String(episode), label: `Episode ${episode}` };
      const id = episode?.id || episode?.episodeId || episode?.number || episode?.episode || index + 1;
      return { id: String(id), label: episode?.title || `Episode ${id}` };
    });
  };
  const clearEpisodes = () => {
    episodeSelect.replaceChildren(new Option('Select an episode', ''));
    episodeSelect.disabled = true;
  };
  const showEpisodes = (item) => {
    selected = item;
    const episodes = episodesOf(item);
    clearEpisodes();
    for (const episode of episodes) episodeSelect.add(new Option(episode.label, episode.id));
    episodeSelect.disabled = episodes.length === 0;
    if (!episodes.length) {
      const links = officialLinksOf(item);
      setStatus(links.length ? 'Direct episodes are unavailable here. Open a verified official provider below.' : 'No episode list or verified official provider was supplied.');
    }
  };
  const renderResults = (items) => {
    resultsList.replaceChildren();
    if (!items.length) {
      setStatus('No results found.');
      clearEpisodes();
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const id = idOf(item);
      if (id === null) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'result-card';
      button.textContent = titleOf(item);
      button.addEventListener('click', () => showEpisodes(item));
      const entry = document.createElement('li');
      entry.append(button);
      for (const link of officialLinksOf(item)) {
        const anchor = document.createElement('a');
        anchor.className = 'official-result-link';
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = `Open on ${link.provider || 'official provider'}`;
        entry.append(anchor);
      }
      fragment.append(entry);
    }
    resultsList.append(fragment);
    setStatus('Choose a title and episode.');
  };
  const search = async (query, signal) => {
    const apiBase = String(config.apiBase || '/api').replace(/\/+$/, '') || '/api';
    const url = new URL(`${apiBase}/search`, window.location.origin);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '20');
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Search failed with status ${response.status}`);
    return response.json();
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;
    searchController?.abort();
    searchController = new AbortController();
    setStatus('Searching…');
    try { renderResults(itemsFrom(await search(query, searchController.signal))); }
    catch (error) {
      if (error?.name === 'AbortError') return;
      resultsList.replaceChildren();
      clearEpisodes();
      setStatus(error?.message || 'Search failed. Try again.');
    }
  });
  episodeSelect.addEventListener('change', () => {
    if (selected && episodeSelect.value) void player.load(idOf(selected), episodeSelect.value);
  });
  window.addEventListener('pagehide', () => searchController?.abort(), { once: true });
});
