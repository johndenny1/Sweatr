// Sweatr's live "chance to hit" estimate for each leg. These are model estimates,
// not sportsbook odds:
//  - Moneyline: ESPN's live win probability when available.
//  - Everything else: the bet's own line is treated as the pregame expectation
//    (books set lines near 50/50), then blended with the live score/stat pace and
//    the share of the game that's left.

import { statValue } from './stats.js';

// ---------- math helpers ----------
function erf(x) {
  // Abramowitz–Stegun 7.1.26
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const probAbove = (threshold, mean, sd) => (sd <= 0 ? (mean > threshold ? 1 : 0) : 1 - normCdf((threshold - mean) / sd));

// P(X >= k) for Poisson(mean)
function poissonAtLeast(k, mean) {
  if (k <= 0) return 1;
  if (mean <= 0) return 0;
  let term = Math.exp(-mean);
  let cdf = term;
  for (let i = 1; i < k; i++) {
    term *= mean / i;
    cdf += term;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

const clamp = (p) => Math.max(0.01, Math.min(0.99, p));

// ---------- how much of the game is done (0 → 1) ----------
function clockMinutes(clock) {
  const m = String(clock || '').match(/(\d+):(\d+)/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const secs = Number(clock);
  return Number.isFinite(secs) ? secs / 60 : null;
}

export function elapsedFraction(league, game) {
  if (!game) return 0;
  if (game.isFinal) return 1;
  if (!game.isLive) return 0;

  if (league === 'mlb') {
    const m = String(game.detail || '').match(/(Top|Bot|Bottom|Mid|Middle|End)\s+(\d+)/i);
    if (!m) return 0.5;
    const inning = Number(m[2]);
    const half = m[1].toLowerCase();
    const done = half.startsWith('top') ? inning - 1 : half.startsWith('end') ? inning : inning - 0.5;
    return Math.min(done / 9, 0.97);
  }

  const setup = {
    nfl: { periods: 4, len: 15 },
    cfb: { periods: 4, len: 15 },
    nba: { periods: 4, len: 12 },
    cbb: { periods: 2, len: 20 },
  }[league];
  if (!setup || !game.period) return 0.5;
  if (game.period > setup.periods) return 0.97; // overtime
  const left = clockMinutes(game.clock);
  const intoPeriod = left == null ? setup.len / 2 : setup.len - left;
  return Math.min(((game.period - 1) * setup.len + intoPeriod) / (setup.periods * setup.len), 0.97);
}

// Full-game standard deviation of the final margin and the final combined score.
const MARGIN_SD = { nfl: 13.5, cfb: 16, nba: 12, cbb: 11, mlb: 4.2 };
const TOTAL_SD = { nfl: 13.5, cfb: 17, nba: 18, cbb: 16, mlb: 4.4 };

// Props: Poisson for low counts; normal for bigger stats, with spread from the remaining
// mean (variance = mean × k) but never below cv × line × √(share left), so boom-or-bust
// stats like receiving yards keep a real chance of a big late play.
const PROP_MODEL = {
  pts: { k: 2, cv: 0.3 }, pra: { k: 2.5, cv: 0.25 }, pr: { k: 2.2, cv: 0.27 }, pa: { k: 2.2, cv: 0.27 },
  reb: { poisson: true }, ast: { poisson: true }, '3pm': { poisson: true }, stl: { poisson: true }, blk: { poisson: true },
  passyds: { k: 17, cv: 0.3 }, rushyds: { k: 11, cv: 0.55 }, recyds: { k: 12, cv: 0.65 }, rushrec: { k: 12, cv: 0.5 },
  rec: { poisson: true }, passtd: { poisson: true }, anytd: { poisson: true }, int: { poisson: true },
  h: { poisson: true }, hr: { poisson: true }, rbi: { poisson: true }, r: { poisson: true },
  hrr: { poisson: true }, bb: { poisson: true }, k: { poisson: true },
};

// Blend the pregame expectation with the live pace as the game goes on.
function projectedFull(current, prior, f) {
  if (f < 0.08) return prior;
  const pace = current / f;
  const w = Math.min(f, 0.85);
  return w * pace + (1 - w) * prior;
}

// ---------- main ----------
// Returns a number 0–1, or null if there's nothing sensible to show.
export function legChance(leg, game, players, result) {
  if (!result) return null;
  if (result.status === 'won') return 1;
  if (result.status === 'lost') return 0;
  if (result.status === 'push') return null;
  if (!game) return null;

  const league = leg.league;
  const f = elapsedFraction(league, game);
  const left = 1 - f;
  const line = Number(leg.line);

  if (leg.type === 'prop') {
    const player = players?.find((p) => p.id === leg.playerId);
    const current = statValue(player?.stats, league, leg.stat);
    const model = PROP_MODEL[leg.stat] || { k: 3 };
    const prior = Math.max(line, 0.5);
    // remaining expected = projected full-game total × share of game left
    const remExp = Math.max(projectedFull(current, prior, f) * left, 0);
    const need = line - current; // over needs more than this
    let over;
    if (model.poisson) {
      const k = Math.floor(need) + 1; // whole units still needed
      over = poissonAtLeast(k, remExp);
    } else {
      const sd = Math.max(Math.sqrt(Math.max(remExp, 0.5) * model.k), (model.cv || 0) * prior * Math.sqrt(left));
      over = probAbove(need, remExp, sd);
    }
    return clamp(leg.side === 'under' ? 1 - over : over);
  }

  const home = Number(game.homeScore) || 0;
  const away = Number(game.awayScore) || 0;

  if (leg.type === 'total') {
    const current = home + away;
    const projected = projectedFull(current, line, f);
    const remExp = Math.max(projected * left, 0);
    const sd = (TOTAL_SD[league] || 15) * Math.sqrt(Math.max(left, 0.02));
    const over = probAbove(line - current, remExp, sd);
    return clamp(leg.side === 'under' ? 1 - over : over);
  }

  const pickIsHome = leg.pick === game.home;
  const margin = pickIsHome ? home - away : away - home;
  const sd = (MARGIN_SD[league] || 12) * Math.sqrt(Math.max(left, 0.02));

  if (leg.type === 'moneyline') {
    if (game.homeWinPct != null) return clamp(pickIsHome ? game.homeWinPct : 1 - game.homeWinPct);
    return clamp(probAbove(0, margin, sd));
  }

  if (leg.type === 'spread') {
    // The spread implies the pregame expected margin for the pick (e.g. -3.5 → expected to win by 3.5).
    const expectedRest = -line * left;
    return clamp(probAbove(-line, margin + expectedRest, sd));
  }

  return null;
}

// Parlay chance = product of leg chances (assumes the legs are independent).
export function parlayChance(chances) {
  const live = chances.filter((c) => c !== null);
  if (!live.length) return null;
  return live.reduce((p, c) => p * c, 1);
}

export const pct = (p) => (p == null ? '–' : p >= 0.995 ? '100%' : p <= 0.005 ? '0%' : `${Math.round(p * 100)}%`);
