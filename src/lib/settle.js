// Works out where each parlay stands (pending / live / won / lost) and saves the
// final result to the database once it's decided, so winnings add up over time.

import { supabase } from './supabase.js';
import { getBox } from './api.js';
import { evaluateLeg, parlayStatus } from './evaluate.js';

const DONE = new Set(['won', 'lost']);

// Returns { [parlayId]: status }. Settled parlays keep their saved status;
// open ones (up to the 25 newest) are checked against live box scores.
export async function refreshStatuses(parlays) {
  const out = {};
  const boxCache = {};
  const box = (league, gameId) => (boxCache[`${league}:${gameId}`] ??= getBox(league, gameId).catch(() => null));

  const open = [];
  for (const p of parlays) {
    if (DONE.has(p.status)) out[p.id] = p.status;
    else if (!p.legs?.length) out[p.id] = 'pending';
    else open.push(p);
  }

  await Promise.all(
    open.slice(0, 25).map(async (p) => {
      const results = await Promise.all(
        p.legs.map(async (leg) => {
          const b = await box(leg.league, leg.gameId);
          return evaluateLeg(leg, b?.game, b?.players);
        })
      );
      const status = parlayStatus(results);
      out[p.id] = status;
      if (DONE.has(status)) await saveResult(p, status);
    })
  );
  for (const p of open.slice(25)) out[p.id] = p.status || 'pending';
  return out;
}

// Ask the server to grade and record the result (users can't write it directly).
export async function saveResult(parlay, status) {
  if (parlay.status === status || parlay._settling) return;
  parlay._settling = true;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch('/api/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
      body: JSON.stringify({ id: parlay.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.status === 'won' || body.status === 'lost') {
      parlay.status = body.status;
      parlay.payout = body.payout;
    }
  } catch {
    // try again next time the slip is viewed
  } finally {
    parlay._settling = false;
  }
}
