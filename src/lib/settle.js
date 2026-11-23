// Works out where each parlay stands (pending / live / won / lost) and saves the
// final result to the database once it's decided, so winnings add up over time.

import { supabase } from './supabase.js';
import { getBox } from './api.js';
import { evaluateLeg, parlayStatus } from './evaluate.js';
import { payoutFor } from './money.js';

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

export async function saveResult(parlay, status) {
  if (parlay.status === status) return;
  const payout = status === 'won' ? payoutFor(parlay.stake, parlay.odds) ?? null : 0;
  parlay.status = status;
  parlay.payout = payout;
  // Ignore errors (e.g. the status columns haven't been added yet).
  await supabase
    .from('parlays')
    .update({ status, payout, settled_at: new Date().toISOString() })
    .eq('id', parlay.id)
    .then(() => {}, () => {});
}
