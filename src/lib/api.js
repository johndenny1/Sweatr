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
export const getBox = (league, gameId) => call({ action: 'box', league, gameId });
export const getGameDetail = (league, gameId, date) =>
  call({ action: 'game', league, gameId, ...(date ? { date } : {}) });

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
