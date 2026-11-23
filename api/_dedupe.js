// Removes legs read twice from overlapping screenshots of one slip.

// Same bet = same player (or team) + stat + over/under + line. A parlay can't hold the same bet twice,
// so a repeat is the same leg read from two overlapping screenshots.
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
function who(leg) {
  const name = norm(leg.player);
  if (name) {
    const parts = name.split(' ');
    return `p:${parts[0][0]}.${parts.at(-1)}`; // "J. Tatum" and "Jayson Tatum" match
  }
  return `t:${norm(leg.team)}|${norm(leg.opponent)}`;
}
export function legKey(leg) {
  const type = String(leg.type || '').toLowerCase();
  const line = Number(leg.line);
  return [
    String(leg.league || '').toLowerCase(),
    type,
    type === 'total' ? [norm(leg.team), norm(leg.opponent)].sort().join('/') : who(leg),
    String(leg.stat || '').toLowerCase(),
    type === 'prop' || type === 'teamprop' || type === 'total' ? (leg.side === 'under' ? 'u' : 'o') : '',
    Number.isFinite(line) ? Math.round(line * 10) / 10 : '',
  ].join('|');
}
export function dedupeLegs(legs) {
  const seen = new Map();
  for (const leg of legs) {
    const k = legKey(leg);
    const prev = seen.get(k);
    // keep the fuller reading of the leg (a cut-off copy has less filled in)
    const filled = (l) => Object.values(l || {}).filter((v) => v != null && v !== '').length;
    if (!prev) {
      seen.set(k, leg);
      continue;
    }
    const best = filled(leg) > filled(prev) ? { ...leg } : { ...prev };
    // keep the full name if one copy was abbreviated ("B. Purdy" vs "Brock Purdy")
    const names = [leg.player, prev.player].filter(Boolean).sort((a, b) => String(b).length - String(a).length);
    if (names.length) best.player = names[0];
    for (const f of ['matchup', 'team', 'opponent', 'date']) best[f] = best[f] ?? leg[f] ?? prev[f];
    seen.set(k, best);
  }
  // keep slip order (first time each leg appeared)
  const order = [];
  for (const leg of legs) {
    const k = legKey(leg);
    if (!order.includes(k)) order.push(k);
  }
  return order.map((k) => seen.get(k));
}
