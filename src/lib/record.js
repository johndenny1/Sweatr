// Betting record from saved parlays (only settled ones count toward money stats).
import { payoutFor } from './money.js';
import { LEAGUE_LIST } from './stats.js';

export function computeRecord(parlays, statuses = {}) {
  // Only verified slips count toward the record and money. Unverified ones are tracked, not counted.
  const all = parlays.map((p) => ({ ...p, status: statuses[p.id] || p.status || 'pending' }));
  const withStatus = all.filter((p) => p.verified === true);
  const settled = withStatus
    .filter((p) => p.status === 'won' || p.status === 'lost')
    .sort((a, b) => new Date(b.settled_at || b.created_at) - new Date(a.settled_at || a.created_at));

  const wins = settled.filter((p) => p.status === 'won');
  const losses = settled.filter((p) => p.status === 'lost');
  const stakeOf = (p) => (Number(p.stake) > 0 ? Number(p.stake) : 0);
  const payoutOf = (p) => (p.status === 'won' ? Number(p.payout ?? payoutFor(p.stake, p.odds) ?? 0) : 0);

  const staked = settled.reduce((s, p) => s + stakeOf(p), 0);
  const returned = settled.reduce((s, p) => s + payoutOf(p), 0);
  const net = Math.round((returned - staked) * 100) / 100;

  let streak = { type: null, count: 0 };
  for (const p of settled) {
    if (!streak.type) streak = { type: p.status, count: 1 };
    else if (p.status === streak.type) streak.count++;
    else break;
  }

  const biggest = wins.reduce(
    (best, p) => {
      const profit = payoutOf(p) - stakeOf(p);
      return profit > best.profit ? { profit, parlay: p } : best;
    },
    { profit: 0, parlay: null }
  );

  const leagueCounts = {};
  for (const p of withStatus) for (const l of p.legs || []) leagueCounts[l.league] = (leagueCounts[l.league] || 0) + 1;
  const leagues = LEAGUE_LIST.map((l) => ({ id: l.id, label: l.label, count: leagueCounts[l.id] || 0 }))
    .filter((l) => l.count > 0)
    .sort((a, b) => b.count - a.count);

  const totalLegs = withStatus.reduce((s, p) => s + (p.legs?.length || 0), 0);

  return {
    total: withStatus.length,
    open: withStatus.length - settled.length,
    wins: wins.length,
    losses: losses.length,
    winRate: settled.length ? wins.length / settled.length : null,
    staked,
    returned,
    net,
    roi: staked > 0 ? net / staked : null,
    streak,
    biggest,
    form: settled.slice(0, 10).map((p) => p.status),
    leagues,
    avgLegs: withStatus.length ? totalLegs / withStatus.length : 0,
    unverified: all.length - withStatus.length,
  };
}
