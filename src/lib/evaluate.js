import { statValue, statDef } from './stats.js';
import { TEAM_STATS } from './teamProps.js';

// Leg statuses: pending (not started) · live · won · lost · push
// An "over" can be locked in mid-game; an "under" can be busted mid-game.

export function evaluateLeg(leg, game, players) {
  if (!game) return { status: 'pending', summary: 'Waiting for game data' };
  const started = game.isLive || game.isFinal;

  if (leg.type === 'prop') {
    const player = players?.find((p) => p.id === leg.playerId);
    const current = statValue(player?.stats, leg.league, leg.stat);
    const line = Number(leg.line);
    const label = statDef(leg.league, leg.stat)?.label || leg.stat;
    const summary = `${current} / ${line} ${label}`;
    const progress = line > 0 ? Math.min(current / line, 1) : current > 0 ? 1 : 0;

    if (!started) return { status: 'pending', summary, current, progress: 0 };
    if (leg.side === 'over') {
      if (current > line) return { status: 'won', summary, current, progress: 1 };
      if (game.isFinal) return { status: current === line ? 'push' : 'lost', summary, current, progress };
      return { status: 'live', summary, current, progress, need: Math.max(Math.floor(line) + 1 - current, 0) };
    }
    // under
    if (current > line) return { status: 'lost', summary, current, progress: 1 };
    if (game.isFinal) return { status: current === line ? 'push' : 'won', summary, current, progress };
    return { status: 'live', summary, current, progress };
  }

  if (leg.type === 'teamprop') {
    const current = Number(game.dstTd?.[leg.pick]) || 0;
    const line = Number(leg.line);
    const summary = `${leg.pick} D/ST: ${current} TD${current === 1 ? '' : 's'}`;
    const progress = line > 0 ? Math.min(current / line, 1) : current > 0 ? 1 : 0;
    if (!started) return { status: 'pending', summary, current, progress: 0 };
    if (leg.side === 'over') {
      if (current > line) return { status: 'won', summary, current, progress: 1 };
      if (game.isFinal) return { status: current === line ? 'push' : 'lost', summary, current, progress };
      return { status: 'live', summary, current, progress };
    }
    if (current > line) return { status: 'lost', summary, current, progress: 1 };
    if (game.isFinal) return { status: current === line ? 'push' : 'won', summary, current, progress };
    return { status: 'live', summary, current };
  }

  const home = Number(game.homeScore) || 0;
  const away = Number(game.awayScore) || 0;
  const scoreLine = `${game.away} ${away} – ${game.home} ${home}`;
  if (!started) return { status: 'pending', summary: scoreLine };

  if (leg.type === 'total') {
    const total = home + away;
    const line = Number(leg.line);
    const summary = `${total} / ${line} total`;
    const progress = line > 0 ? Math.min(total / line, 1) : 0;
    if (leg.side === 'over' && total > line) return { status: 'won', summary, progress: 1 };
    if (leg.side === 'under' && total > line) return { status: 'lost', summary, progress: 1 };
    if (!game.isFinal) return { status: 'live', summary, progress };
    if (total === line) return { status: 'push', summary, progress };
    return { status: leg.side === 'under' ? 'won' : 'lost', summary, progress };
  }

  // moneyline + spread: margin from the picked team's side
  const pickIsHome = leg.pick === game.home;
  const margin = (pickIsHome ? home - away : away - home) + (leg.type === 'spread' ? Number(leg.line) : 0);
  const covering = margin > 0 ? 'Covering' : margin === 0 ? 'Even' : 'Trailing';
  if (!game.isFinal) return { status: 'live', summary: `${scoreLine} · ${covering}`, leading: margin > 0 };
  if (margin === 0) return { status: 'push', summary: scoreLine };
  return { status: margin > 0 ? 'won' : 'lost', summary: scoreLine };
}

export function parlayStatus(results) {
  if (!results.length) return 'pending';
  if (results.some((r) => r.status === 'lost')) return 'lost';
  if (results.every((r) => r.status === 'won' || r.status === 'push')) return 'won';
  if (results.some((r) => r.status === 'live' || r.status === 'won')) return 'live';
  return 'pending';
}

export function describeLeg(leg) {
  if (leg.type === 'prop') {
    const label = statDef(leg.league, leg.stat)?.label || leg.stat;
    return `${leg.playerName} ${leg.side === 'over' ? 'Over' : 'Under'} ${leg.line} ${label}`;
  }
  if (leg.type === 'teamprop') {
    const line = Number(leg.line);
    if (line === 0.5) return leg.side === 'under' ? `No ${leg.pick} D/ST touchdown` : `${leg.pick} D/ST scores a touchdown`;
    return `${leg.pick} D/ST ${leg.side === 'under' ? 'Under' : 'Over'} ${leg.line} ${TEAM_STATS.dsttd.label}`;
  }
  if (leg.type === 'moneyline') return `${leg.pick} to win`;
  if (leg.type === 'spread') return `${leg.pick} ${Number(leg.line) > 0 ? '+' : ''}${leg.line}`;
  return `${leg.side === 'over' ? 'Over' : 'Under'} ${leg.line} total points`;
}
