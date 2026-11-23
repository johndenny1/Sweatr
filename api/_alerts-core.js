// Works out which push alerts a slip has earned since the last check. Pure logic (easy to test).
import { evaluateLeg, parlayStatus, describeLeg } from '../src/lib/evaluate.js';
import { statDef } from '../src/lib/stats.js';
import { toWin, fmtMoney } from '../src/lib/money.js';
import { makeAlert } from '../src/lib/alertCopy.js';

const lastName = (n) => String(n || '').trim().split(/\s+/).slice(-1)[0] || n;
const fmt = (n) => (n == null ? '' : Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// boxFor(leg) → { game, players } | null
export function slipKeys(parlay, boxFor) {
  const legs = parlay.legs || [];
  const rows = legs.map((leg) => {
    const box = boxFor(leg);
    return { leg, game: box?.game, result: evaluateLeg(leg, box?.game, box?.players) };
  });
  const keys = new Set();
  const overall = rows.length ? parlayStatus(rows.map((r) => r.result)) : 'pending';
  if (rows.some((r) => r.game && (r.game.isLive || r.game.isFinal))) keys.add('start');
  rows.forEach(({ leg, result }, i) => {
    if (result.status === 'won') keys.add(`hit:${i}`);
    if (result.status === 'lost') keys.add(`miss:${i}`);
    if (result.status === 'live' && leg.type === 'prop' && leg.side === 'over' && result.progress >= 0.75 && result.need > 0)
      keys.add(`close:${i}`);
  });
  const done = rows.filter((r) => r.result.status === 'won' || r.result.status === 'push').length;
  const open = rows.filter((r) => r.result.status === 'live' || r.result.status === 'pending');
  if (rows.length >= 3 && done === rows.length - 1 && open.length === 1) keys.add('last');
  if (overall === 'won') keys.add('cashed');
  if (overall === 'lost') keys.add('lost');
  return { keys, rows, overall };
}

function legVars(parlay, rows, i) {
  const { leg, result, game } = rows[i];
  const hits = rows.filter((r) => r.result.status === 'won' || r.result.status === 'push').length;
  const win = toWin(parlay.stake, parlay.odds);
  return {
    name: parlay.name || 'your slip',
    player: leg.playerName,
    last: leg.type === 'prop' ? lastName(leg.playerName) : leg.pick,
    lastOrTeam: leg.type === 'prop' ? lastName(leg.playerName) : leg.pick,
    team: leg.pick,
    leg: describeLeg(leg),
    line: leg.line,
    stat: (statDef(leg.league, leg.stat)?.label || leg.stat || '').toLowerCase().replace(/tds\b/, 'TDs'),
    current: fmt(result.current),
    need: result.need,
    hits,
    total: rows.length,
    left: rows.length - hits,
    win: win != null ? fmtMoney(win) : 'the bag',
    game: game ? `${game.away} @ ${game.home}` : `${leg.away || ''} @ ${leg.home || ''}`,
  };
}

// Decide what to send for the keys that are new since last time. Returns [{ key, title, body }]
export function chooseAlerts(parlay, rows, fresh, sentBefore) {
  if (sentBefore.has('lost') || sentBefore.has('cashed')) return [];
  const idx = (k) => Number(k.split(':')[1]);
  const base = { name: parlay.name || 'your slip', total: rows.length };

  if (fresh.has('cashed')) {
    const v = legVars(parlay, rows, rows.length - 1);
    return [{ key: 'cashed', ...makeAlert('cashed', v) }];
  }
  if (fresh.has('lost')) {
    const missed = rows.map((r, i) => (r.result.status === 'lost' ? i : -1)).filter((i) => i >= 0);
    const i = missed.find((m) => fresh.has(`miss:${m}`)) ?? missed[0];
    const v = legVars(parlay, rows, i);
    const isProp = rows[i].leg.type === 'prop';
    const kind = missed.length === 1 && rows.length >= 3 && v.hits === rows.length - 1 ? (isProp ? 'badBeat' : 'missTeam') : isProp ? 'miss' : 'missTeam';
    return [{ key: 'lost', ...makeAlert(kind, v) }];
  }

  const out = [];
  if (fresh.has('last')) {
    const i = rows.findIndex((r) => r.result.status === 'live' || r.result.status === 'pending');
    out.push({ key: 'last', ...makeAlert('last', legVars(parlay, rows, i)) });
  }
  for (const k of [...fresh].filter((k) => k.startsWith('hit:'))) {
    if (out.length >= 2) break;
    if (fresh.has('last') && out.length) break; // "one leg left" already says it
    const i = idx(k);
    out.push({ key: k, ...makeAlert(rows[i].leg.type === 'prop' ? 'hit' : 'hitTeam', legVars(parlay, rows, i)) });
  }
  for (const k of [...fresh].filter((k) => k.startsWith('close:'))) {
    if (out.length >= 2) break;
    out.push({ key: k, ...makeAlert('close', legVars(parlay, rows, idx(k))) });
  }
  if (!out.length && fresh.has('start')) {
    const live = rows.find((r) => r.game && (r.game.isLive || r.game.isFinal)) || rows[0];
    out.push({ key: 'start', ...makeAlert('start', { ...base, game: live?.game ? `${live.game.away} @ ${live.game.home}` : 'Your game' }) });
  }
  return out;
}
