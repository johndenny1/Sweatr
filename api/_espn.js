// ESPN's public site API: free, live, no key. It's unofficial, so if ESPN ever
// changes a path, this file is the only place to fix it.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export const LEAGUES = {
  nfl: { path: 'football/nfl' },
  nba: { path: 'basketball/nba' },
  mlb: { path: 'baseball/mlb' },
  // College scoreboards only show ranked/featured games unless you pass a group:
  // 80 = all FBS football, 50 = all Division I basketball.
  cfb: { path: 'football/college-football', groups: 80 },
  cbb: { path: 'basketball/mens-college-basketball', groups: 50 },
};

export function scoreboardUrl(league, date) {
  const cfg = LEAGUES[league];
  const params = new URLSearchParams({ dates: date.replace(/-/g, ''), limit: '500' });
  if (cfg.groups) params.set('groups', String(cfg.groups));
  return `${BASE}/${cfg.path}/scoreboard?${params}`;
}
export const summaryUrl = (league, eventId) => `${BASE}/${LEAGUES[league].path}/summary?event=${eventId}`;
export const rosterUrl = (league, teamId) => `${BASE}/${LEAGUES[league].path}/teams/${teamId}/roster`;

// ---------- normalizers: turn ESPN's shapes into the app's shapes ----------

function normalizeCompetition(id, comp, start) {
  if (!comp) return null;
  const status = comp.status || {};
  const type = status.type || {};
  const home = comp.competitors?.find((c) => c.homeAway === 'home') || {};
  const away = comp.competitors?.find((c) => c.homeAway === 'away') || {};
  const isFinal = type.completed === true;
  const isLive = !isFinal && type.state === 'in';
  const score = (c) => (c.score === undefined || c.score === '' ? null : Number(c.score?.value ?? c.score));
  return {
    id: String(id),
    home: home.team?.abbreviation,
    away: away.team?.abbreviation,
    homeId: home.team?.id ? String(home.team.id) : null,
    awayId: away.team?.id ? String(away.team.id) : null,
    homeScore: type.state === 'pre' ? null : score(home),
    awayScore: type.state === 'pre' ? null : score(away),
    start: start || comp.date || null,
    status: type.description || type.name || '',
    isLive,
    isFinal,
    detail: isLive || isFinal || /postpone|cancel|suspend|delay/i.test(type.name || '') ? type.shortDetail || '' : '',
  };
}

export function normalizeScoreboard(data) {
  return (data?.events || [])
    .map((e) => normalizeCompetition(e.id, e.competitions?.[0], e.date))
    .filter((g) => g && g.home && g.away);
}

// "4-15" under key "fieldGoalsMade-fieldGoalsAttempted" → both numbers.
function addStats(out, group, keys, values) {
  keys.forEach((key, i) => {
    const raw = values?.[i];
    if (raw === undefined || raw === null) return;
    const parts = /[-/]/.test(key) && /^-?\d+(\.\d+)?[-/]\d+/.test(String(raw))
      ? [key.split(/[-/]/), String(raw).split(/[-/]/)]
      : [[key], [String(raw)]];
    parts[0].forEach((k, j) => {
      const n = Number(parts[1][j]);
      if (!Number.isFinite(n)) return;
      if (group) out[`${group}.${k}`] = n;
      if (!(k in out)) out[k] = n; // plain key: first group wins
    });
  });
}

export function normalizeSummary(data, eventId) {
  const header = data?.header;
  const game = normalizeCompetition(header?.id || eventId, header?.competitions?.[0], header?.competitions?.[0]?.date);
  const byId = new Map();
  for (const team of data?.boxscore?.players || []) {
    const abbr = team.team?.abbreviation;
    for (const group of team.statistics || []) {
      const name = group.name || group.type || '';
      for (const a of group.athletes || []) {
        const id = String(a.athlete?.id || '');
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, { id, name: a.athlete?.displayName || '', team: abbr, stats: {} });
        addStats(byId.get(id).stats, name, group.keys || [], a.stats || []);
      }
    }
  }
  return { game, players: [...byId.values()] };
}

export function normalizeRoster(data, teamAbbr) {
  const list = [];
  for (const entry of data?.athletes || []) {
    // NFL/CFB group athletes by unit ({ position, items: [...] }); NBA/MLB are flat.
    for (const a of entry.items || [entry]) {
      if (!a?.id) continue;
      const status = a.status?.type || a.status?.name || '';
      if (/inactive|retired/i.test(status)) continue;
      list.push({
        id: String(a.id),
        name: a.displayName || a.fullName || `${a.firstName || ''} ${a.lastName || ''}`.trim(),
        team: data?.team?.abbreviation || teamAbbr || '',
        position: a.position?.abbreviation || '',
        active: true,
      });
    }
  }
  return list;
}
