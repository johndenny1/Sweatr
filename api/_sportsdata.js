// SportsDataIO config + normalizers. Files starting with "_" are not deployed
// as their own endpoints on Vercel, so this is a private helper module.
//
// If an endpoint 404s for your plan, check the path against the API docs at
// sportsdata.io/developers and edit it here — it's the only place paths live.

export const LEAGUES = {
  nfl: {
    games: (date) => `/v3/nfl/scores/json/ScoresByDate/${date}`,
    box: (id) => `/v3/nfl/stats/json/BoxScoreByScoreIDV3/${id}`,
    roster: (team) => `/v3/nfl/scores/json/Players/${team}`,
  },
  nba: {
    games: (date) => `/v3/nba/scores/json/GamesByDate/${date}`,
    box: (id) => `/v3/nba/stats/json/BoxScore/${id}`,
    roster: (team) => `/v3/nba/scores/json/Players/${team}`,
  },
  mlb: {
    games: (date) => `/v3/mlb/scores/json/GamesByDate/${date}`,
    box: (id) => `/v3/mlb/stats/json/BoxScore/${id}`,
    roster: (team) => `/v3/mlb/scores/json/Players/${team}`,
  },
  cfb: {
    games: (date) => `/v3/cfb/scores/json/GamesByDate/${date}`,
    box: (id) => `/v3/cfb/stats/json/BoxScore/${id}`,
    roster: (team) => `/v3/cfb/scores/json/Players/${team}`,
  },
  cbb: {
    games: (date) => `/v3/cbb/scores/json/GamesByDate/${date}`,
    box: (id) => `/v3/cbb/stats/json/BoxScore/${id}`,
    roster: (team) => `/v3/cbb/scores/json/Players/${team}`,
  },
};

export function apiKeyFor(league) {
  return process.env[`SPORTSDATA_KEY_${league.toUpperCase()}`] || process.env.SPORTSDATA_API_KEY;
}

const first = (...vals) => vals.find((v) => v !== undefined && v !== null);

// Different leagues name the same fields differently; flatten to one shape.
export function normalizeGame(g) {
  if (!g) return null;
  const status = g.Status || 'Scheduled';
  const isFinal = /^F/i.test(status) || g.IsClosed === true;
  const isLive = !isFinal && (status === 'InProgress' || g.IsInProgress === true);

  let detail = '';
  if (isLive) {
    if (g.Inning) {
      detail = `${g.InningHalf === 'T' ? 'Top' : g.InningHalf === 'B' ? 'Bot' : ''} ${g.Inning}`.trim();
    } else {
      const raw = first(g.Quarter, g.Period, g.Half);
      const prefix = g.Quarter != null ? 'Q' : g.Half != null ? 'H' : 'P';
      const period = raw != null && !isNaN(raw) ? `${prefix}${raw}` : raw;
      const mins = first(g.TimeRemainingMinutes, g.TimeRemaining);
      const secs = g.TimeRemainingSeconds;
      const clock = mins !== undefined && secs !== undefined ? `${mins}:${String(secs).padStart(2, '0')}` : '';
      detail = [period || '', clock].filter(Boolean).join(' · ');
    }
  } else if (isFinal) {
    detail = status === 'Final' ? 'Final' : status.replace(/^F\//, 'Final/');
  } else if (/postponed|canceled|cancelled|suspended/i.test(status)) {
    detail = status;
  }

  return {
    id: String(first(g.GameID, g.ScoreID, g.GlobalGameID)),
    home: first(g.HomeTeam, g.HomeTeamName, g.HomeTeamKey),
    away: first(g.AwayTeam, g.AwayTeamName, g.AwayTeamKey),
    homeScore: first(g.HomeTeamScore, g.HomeScore, g.HomeTeamRuns, null),
    awayScore: first(g.AwayTeamScore, g.AwayScore, g.AwayTeamRuns, null),
    start: first(g.DateTime, g.Date, g.Day, null),
    status,
    isLive,
    isFinal,
    detail,
  };
}

// Keep only numeric stat fields so the payload stays small.
function numericStats(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'number' && !/ID$|Id$|Number$|Salary|Season|Week|Jersey/.test(k)) out[k] = v;
  }
  return out;
}

export function normalizeBox(b) {
  const box = Array.isArray(b) ? b[0] : b;
  if (!box) return { game: null, players: [] };
  const players = [...(box.PlayerGames || []), ...(box.PlayerGameStats || [])].map((p) => ({
    id: String(p.PlayerID),
    name: p.Name || `${p.FirstName || ''} ${p.LastName || ''}`.trim(),
    team: p.Team,
    stats: numericStats(p),
  }));
  return { game: normalizeGame(box.Game || box.Score), players };
}

export function normalizePlayer(p) {
  return {
    id: String(p.PlayerID),
    name: p.Name || `${p.FirstName || ''} ${p.LastName || ''}`.trim(),
    team: p.Team,
    position: p.Position || '',
    active: p.Status ? p.Status === 'Active' : true,
  };
}
