// Removes legs read twice from overlapping screenshots of one slip.
//
// Each screenshot is read on its own, so the same leg can come back worded differently:
// the league can differ (a rookie tagged "cfb" in one read, "nfl" in the other), the team can be
// "DAL" in one and "Dallas Cowboys" in the other, and the opponent can be filled in or missing.
// So legs are compared on what decides the bet (who, stat, side, line), not on those labels.
// A parlay can't hold the same bet twice, so a match is the same leg read twice.

const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
const flat = (x) => norm(x).replace(/ /g, '');

const TEAM_ALIASES = [
  ['gs', 'gsw'], ['ny', 'nyk'], ['sa', 'sas'], ['no', 'nop', 'nor'], ['pho', 'phx'],
  ['uta', 'utah', 'uth'], ['was', 'wsh', 'wash'], ['bkn', 'bk', 'brk'], ['cha', 'cho'],
  ['jax', 'jac'], ['lar', 'la'], ['lv', 'lvr', 'oak'], ['kc', 'kan'], ['tb', 'tam'],
  ['chw', 'cws'], ['sd', 'sdp'], ['sf', 'sfg'], ['ath', 'oak'],
];

// "DAL" ~ "Dallas Cowboys", "KC" ~ "Kansas City Chiefs", "GB" ~ "Green Bay Packers"
function sameTeam(a, b) {
  const x = flat(a);
  const y = flat(b);
  if (!x || !y) return false;
  if (x === y || TEAM_ALIASES.some((g) => g.includes(x) && g.includes(y))) return true;
  const [short, long, longWords] = x.length <= y.length ? [x, y, norm(b)] : [y, x, norm(a)];
  if (short.length < 2 || short.length > 4) return false;
  const initials = longWords.split(' ').map((w) => w[0]).join('');
  return long.startsWith(short) || initials.startsWith(short);
}

// "J. Tatum" ~ "Jayson Tatum", but "Eli Johnson" is not "Emmett Johnson"
function samePlayer(a, b) {
  const x = norm(a).split(' ');
  const y = norm(b).split(' ');
  if (!x[0] || !y[0]) return false;
  if (x.at(-1) !== y.at(-1)) return false;
  if (x.length === 1 || y.length === 1) return true; // only a last name was read
  const [fx, fy] = [x[0], y[0]];
  if (fx.length === 1 || fy.length === 1) return fx[0] === fy[0];
  return fx.startsWith(fy) || fy.startsWith(fx);
}

const lineOf = (l) => {
  const n = Number(l.line);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};
const sideOf = (l) => (l.side === 'under' ? 'u' : 'o');
const typeOf = (l) => String(l.type || '').toLowerCase();
const sameMatchup = (a, b) => flat(a.matchup) && flat(a.matchup) === flat(b.matchup);

export function sameLeg(a, b, loose = false) {
  const type = typeOf(a);
  if (type !== typeOf(b) || lineOf(a) !== lineOf(b)) return false;
  const stat = String(a.stat || '').toLowerCase() === String(b.stat || '').toLowerCase();
  switch (type) {
    case 'prop':
      if (!stat || sideOf(a) !== sideOf(b)) return false;
      return loose ? norm(a.player).split(' ').at(-1) === norm(b.player).split(' ').at(-1) : samePlayer(a.player, b.player);
    case 'teamprop':
      return stat && sideOf(a) === sideOf(b) && sameTeam(a.team, b.team);
    case 'total': {
      if (sideOf(a) !== sideOf(b)) return false;
      if (sameMatchup(a, b)) return true;
      return [a.team, a.opponent].filter(Boolean).some((t) => [b.team, b.opponent].some((u) => sameTeam(t, u)));
    }
    case 'spread':
    case 'moneyline':
      // Both sides of one game at the same spread/moneyline can't be on one slip, so the same matchup
      // heading + same line is the same leg even if the team was written two different ways.
      return sameTeam(a.team, b.team) || sameMatchup(a, b) || (loose && String(a.league || '') === String(b.league || ''));
    default:
      return norm(a.raw) !== '' && norm(a.raw) === norm(b.raw);
  }
}

// Legs listed under the same game heading are in the same league. The AI sometimes tags a rookie with
// his college league ("Emmett Johnson" under "KC Chiefs vs BUF Bills" read as cfb), so the majority
// league under that heading wins.
export function alignLeagues(legs) {
  const byMatchup = {};
  for (const l of legs) {
    const m = flat(l.matchup);
    const lg = String(l.league || '').toLowerCase();
    if (!m || !lg) continue;
    (byMatchup[m] ??= {})[lg] = (byMatchup[m][lg] || 0) + 1;
  }
  return legs.map((l) => {
    const counts = byMatchup[flat(l.matchup)];
    if (!counts) return l;
    // tie: pro league wins (a college star who just got drafted is the usual mix-up)
    const pro = (x) => (['nfl', 'nba', 'mlb'].includes(x) ? 1 : 0);
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || pro(b) - pro(a))[0];
    return top !== String(l.league || '').toLowerCase() ? { ...l, league: top } : l;
  });
}

export function dedupeLegs(legs, { loose = false } = {}) {
  legs = alignLeagues(legs);
  // Most common league on the slip: when two reads of a leg disagree on league, trust this one.
  const count = {};
  for (const l of legs) {
    const lg = String(l.league || '').toLowerCase();
    if (lg) count[lg] = (count[lg] || 0) + 1;
  }
  const mainLeague = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  const filled = (l) => Object.values(l || {}).filter((v) => v != null && v !== '').length;

  const out = [];
  for (const leg of legs) {
    const i = out.findIndex((prev) => sameLeg(prev, leg, loose));
    if (i === -1) {
      out.push({ ...leg });
      continue;
    }
    const prev = out[i];
    // keep the fuller reading of the leg (a cut-off copy has less filled in)
    const best = filled(leg) > filled(prev) ? { ...leg } : { ...prev };
    // keep the full name if one copy was abbreviated ("B. Purdy" vs "Brock Purdy")
    const names = [leg.player, prev.player].filter(Boolean).sort((a, b) => String(b).length - String(a).length);
    if (names.length) best.player = names[0];
    for (const f of ['matchup', 'team', 'opponent', 'date']) best[f] = best[f] ?? leg[f] ?? prev[f];
    const leagues = [prev.league, leg.league].map((x) => String(x || '').toLowerCase());
    if (leagues[0] !== leagues[1] && leagues.includes(mainLeague)) best.league = mainLeague;
    out[i] = best; // stays in the slot where the leg first appeared (slip order)
  }
  return out;
}
