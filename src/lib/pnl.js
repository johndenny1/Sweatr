// Profit & loss over time from your verified, settled slips.
import { payoutFor } from './money.js';

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// [{ parlay, date, profit }] oldest first
export function pnlEntries(parlays, statuses = {}) {
  return parlays
    .map((p) => ({ ...p, status: statuses[p.id] || p.status }))
    .filter((p) => p.verified === true && (p.status === 'won' || p.status === 'lost'))
    .map((p) => {
      const stake = Number(p.stake) > 0 ? Number(p.stake) : 0;
      const payout = p.status === 'won' ? Number(p.payout ?? payoutFor(p.stake, p.odds) ?? 0) : 0;
      return { parlay: p, date: new Date(p.settled_at || p.created_at), profit: Math.round((payout - stake) * 100) / 100 };
    })
    .sort((a, b) => a.date - b.date);
}

// { 'YYYY-MM-DD': { profit, wins, losses, entries } }
export function byDay(entries) {
  const out = {};
  for (const e of entries) {
    const k = dayKey(e.date);
    const d = (out[k] ||= { profit: 0, wins: 0, losses: 0, entries: [] });
    d.profit = Math.round((d.profit + e.profit) * 100) / 100;
    if (e.profit >= 0 && e.parlay.status === 'won') d.wins++;
    else d.losses++;
    d.entries.push(e);
  }
  return out;
}

// Running total, one point per settled slip, starting at 0 just before the first one
export function cumulative(entries, sinceDate = null) {
  const list = sinceDate ? entries.filter((e) => e.date >= sinceDate) : entries;
  const start = sinceDate ? entries.filter((e) => e.date < sinceDate).reduce((s, e) => s + e.profit, 0) : 0;
  let total = start;
  const points = [{ date: list[0] ? new Date(list[0].date.getTime() - 1) : new Date(), value: Math.round(start * 100) / 100 }];
  for (const e of list) {
    total += e.profit;
    points.push({ date: e.date, value: Math.round(total * 100) / 100 });
  }
  return points;
}
