// Your own slips only. (Since Rooms, the database also lets you read slips friends shared with you,
// so every "my stuff" screen has to filter by owner.)
import { supabase } from './supabase.js';

export async function loadMyParlays(userId) {
  const { data, error } = await supabase
    .from('parlays')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

// ---------- Shared cache so switching tabs never flashes $0 ----------
// Every screen reads the same copy instantly (kept in memory and on the phone),
// then quietly refreshes it in the background.
import { useEffect, useState } from 'react';
import { refreshStatuses } from './settle.js';

let cache = { userId: null, parlays: null, statuses: {}, error: '' };
const listeners = new Set();
let inflight = null;

const storeKey = (id) => `sweatr-slips-${id}`;
function fromDisk(userId) {
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return { userId, parlays: v.parlays || null, statuses: v.statuses || {}, error: '' };
  } catch {
    return null;
  }
}
function toDisk() {
  try {
    if (cache.userId && cache.parlays) localStorage.setItem(storeKey(cache.userId), JSON.stringify({ parlays: cache.parlays, statuses: cache.statuses }));
  } catch {}
}
function publish(next) {
  cache = next;
  toDisk();
  listeners.forEach((fn) => fn(cache));
}

// One slip by id, from whatever we already have (open slips, or your list), for instant first paint.
const oneCache = new Map();
export function rememberParlay(p) {
  if (p?.id) oneCache.set(p.id, p);
}
export function peekParlay(id) {
  return oneCache.get(id) || cache.parlays?.find((p) => p.id === id) || null;
}

export function refreshMyParlays(userId) {
  if (inflight && inflight.userId === userId) return inflight.promise;
  const promise = (async () => {
    const { data, error } = await loadMyParlays(userId);
    if (cache.userId !== userId) cache = { userId, parlays: null, statuses: {}, error: '' };
    if (error) {
      publish({ ...cache, error: error.message });
      return;
    }
    publish({ ...cache, parlays: data, error: '' });
    const statuses = await refreshStatuses(data);
    if (cache.userId === userId) publish({ ...cache, statuses });
  })().finally(() => {
    inflight = null;
  });
  inflight = { userId, promise };
  return promise;
}

export function useMyParlays(userId) {
  const [state, setState] = useState(() => {
    if (cache.userId === userId && cache.parlays) return cache;
    const disk = fromDisk(userId);
    if (disk) cache = disk;
    return disk || { userId, parlays: null, statuses: {}, error: '' };
  });
  useEffect(() => {
    const fn = (c) => c.userId === userId && setState(c);
    listeners.add(fn);
    refreshMyParlays(userId);
    return () => listeners.delete(fn);
  }, [userId]);
  return state; // { parlays (null until the very first load), statuses, error }
}
