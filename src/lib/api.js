import { supabase } from './supabase.js';

async function call(params) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch(`/api/sports?${new URLSearchParams(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const getGames = (league, date) => call({ action: 'games', league, date });
export const getRoster = (league, team) => call({ action: 'roster', league, team });
export const searchPlayer = (league, name) => call({ action: 'findplayer', league, name }).catch(() => []);
// Last copy of every box score / game page we've fetched, so screens can show it instantly
// while a fresh copy loads in the background (no "Loading…" when you tap around).
const boxCache = new Map();
const gameCache = new Map();
const gameInflight = new Map();

export const peekBox = (league, gameId) => boxCache.get(`${league}:${gameId}`);
export const peekGame = (league, gameId) => gameCache.get(`${league}:${gameId}`);

export const getBox = (league, gameId) =>
  call({ action: 'box', league, gameId }).then((b) => {
    boxCache.set(`${league}:${gameId}`, b);
    return b;
  });

export function getGameDetail(league, gameId, date) {
  const k = `${league}:${gameId}`;
  if (gameInflight.has(k)) return gameInflight.get(k);
  const p = call({ action: 'game', league, gameId, ...(date ? { date } : {}) })
    .then((d) => {
      gameCache.set(k, d);
      return d;
    })
    .finally(() => gameInflight.delete(k));
  gameInflight.set(k, p);
  return p;
}

// Warm the game page in the background so tapping into it is instant.
export function prefetchGame(league, gameId, date) {
  if (gameCache.has(`${league}:${gameId}`)) return;
  getGameDetail(league, gameId, date).catch(() => {});
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
