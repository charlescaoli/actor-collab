import { TMDB_API_KEY } from './config.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

let API_KEY = TMDB_API_KEY;

export function setApiKey(key) {
  API_KEY = key;
}

export function getApiKey() {
  return API_KEY;
}

async function fetchTMDB(path, params = {}) {
  if (!API_KEY) {
    throw new Error('API_KEY_NOT_SET');
  }
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'zh-CN');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw new Error('INVALID_API_KEY');
    if (res.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export async function searchPerson(query) {
  const data = await fetchTMDB('/search/person', { query });
  return data.results || [];
}

export async function getPersonDetails(id) {
  return fetchTMDB(`/person/${id}`);
}

export async function getPersonMovieCredits(id) {
  const data = await fetchTMDB(`/person/${id}/movie_credits`);
  return data.cast || [];
}

export async function getPersonTVCredits(id) {
  const data = await fetchTMDB(`/person/${id}/tv_credits`);
  return data.cast || [];
}

export async function getMovieCredits(movieId) {
  const data = await fetchTMDB(`/movie/${movieId}/credits`);
  return data.cast || [];
}

export async function getTVCredits(tvId) {
  const data = await fetchTMDB(`/tv/${tvId}/credits`);
  return data.cast || [];
}

export function profileUrl(path, size = 'w185') {
  if (!path) return '';
  return `${IMG_BASE}/${size}${path}`;
}

export function posterUrl(path, size = 'w92') {
  if (!path) return '';
  return `${IMG_BASE}/${size}${path}`;
}

export function backdropUrl(path, size = 'w780') {
  if (!path) return '';
  return `${IMG_BASE}/${size}${path}`;
}

export async function getMovieDetails(movieId) {
  return fetchTMDB(`/movie/${movieId}`);
}

export async function getTVDetails(tvId) {
  return fetchTMDB(`/tv/${tvId}`);
}
