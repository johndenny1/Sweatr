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
    homeNames: [home.team?.displayName, home.team?.shortDisplayName, home.team?.name, home.team?.location].filter(Boolean),
    awayNames: [away.team?.displayName, away.team?.shortDisplayName, away.team?.name, away.team?.location].filter(Boolean),
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

// ---------- full game view: situation, linescore, team stats, play-by-play ----------

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v?.value ?? v));

function teamSide(c, sbComp) {
  const sb = sbComp?.competitors?.find((x) => String(x.team?.id) === String(c.team?.id));
  const team = c.team || {};
  return {
    id: String(team.id || ''),
    abbr: team.abbreviation || '',
    name: team.displayName || team.name || team.abbreviation || '',
    logo: team.logos?.[0]?.href || team.logo || sb?.team?.logo || null,
    color: team.color ? `#${team.color}` : sb?.team?.color ? `#${sb.team.color}` : null,
    record: c.record?.[0]?.summary || c.record?.[0]?.displayValue || sb?.records?.[0]?.summary || '',
    score: num(c.score),
    linescore: (c.linescores || sb?.linescores || []).map((l) => l.displayValue ?? String(l.value ?? '')),
    possession: c.possession === true,
  };
}

function footballPlays(drives) {
  const list = [...(drives?.previous || []), ...(drives?.current ? [drives.current] : [])];
  const seen = new Set();
  const out = [];
  for (const d of list) {
    for (const p of d.plays || []) {
      if (!p.text || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({
        id: String(p.id),
        text: p.text,
        clock: p.clock?.displayValue || '',
        period: p.period?.number ?? null,
        periodLabel: p.period?.displayValue || null,
        down: p.start?.downDistanceText || p.start?.shortDownDistanceText || '',
        teamId: p.start?.team?.id ? String(p.start.team.id) : d.team?.id ? String(d.team.id) : null,
        scoring: p.scoringPlay === true || (p.scoreValue || 0) > 0,
        type: p.type?.text || '',
        homeScore: num(p.homeScore),
        awayScore: num(p.awayScore),
      });
    }
  }
  return out;
}

function otherPlays(plays) {
  return (plays || [])
    .filter((p) => p.text)
    .map((p) => ({
      id: String(p.id),
      text: p.text,
      clock: p.clock?.displayValue || '',
      period: p.period?.number ?? null,
      periodLabel: p.period?.displayValue || null,
      down: '',
      teamId: p.team?.id ? String(p.team.id) : null,
      scoring: p.scoringPlay === true,
      type: p.type?.text || '',
      homeScore: num(p.homeScore),
      awayScore: num(p.awayScore),
    }));
}

function situationFrom(sb, drives, sides) {
  const s = sb?.situation;
  const lastDrivePlay = drives?.current?.plays?.at?.(-1);
  const sit = {
    downDistance: s?.downDistanceText || lastDrivePlay?.end?.downDistanceText || '',
    possessionTeamId: s?.possession
      ? String(s.possession)
      : lastDrivePlay?.end?.team?.id
        ? String(lastDrivePlay.end.team.id)
        : drives?.current?.team?.id
          ? String(drives.current.team.id)
          : sides.find((t) => t.possession)?.id || null,
    redZone: s?.isRedZone === true,
    homeTimeouts: s?.homeTimeouts ?? null,
    awayTimeouts: s?.awayTimeouts ?? null,
    balls: s?.balls ?? null,
    strikes: s?.strikes ?? null,
    outs: s?.outs ?? null,
    onFirst: s?.onFirst === true,
    onSecond: s?.onSecond === true,
    onThird: s?.onThird === true,
    batter: s?.batter?.athlete?.displayName || s?.batter?.athlete?.shortName || '',
    pitcher: s?.pitcher?.athlete?.displayName || s?.pitcher?.athlete?.shortName || '',
    lastPlay: s?.lastPlay?.text || '',
  };
  return sit;
}

export function normalizeDetail(summary, scoreboard, eventId) {
  const { game, players } = normalizeSummary(summary, eventId);
  const comp = summary?.header?.competitions?.[0];
  const sbEvent = (scoreboard?.events || []).find((e) => String(e.id) === String(eventId));
  const sbComp = sbEvent?.competitions?.[0];

  const sides = (comp?.competitors || sbComp?.competitors || []).map((c) => ({ ...teamSide(c, sbComp), homeAway: c.homeAway }));
  const home = sides.find((t) => t.homeAway === 'home') || null;
  const away = sides.find((t) => t.homeAway === 'away') || null;

  const plays = summary?.drives ? footballPlays(summary.drives) : otherPlays(summary?.plays);

  const teamStats = (summary?.boxscore?.teams || []).map((t) => ({
    id: String(t.team?.id || ''),
    abbr: t.team?.abbreviation || '',
    stats: (t.statistics || [])
      .filter((s) => s.displayValue !== undefined && (s.label || s.name))
      .map((s) => ({ key: s.name || s.label, label: s.label || s.name, value: s.displayValue })),
  }));

  // Full box score, grouped the way ESPN shows it (Passing / Rushing / Batting / ...).
  const titleCase = (t) => String(t || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  const boxscore = (summary?.boxscore?.players || []).map((team) => ({
    teamId: String(team.team?.id || ''),
    abbr: team.team?.abbreviation || '',
    groups: (team.statistics || [])
      .map((g) => ({
        title: titleCase(g.text || g.name || g.type || 'Players'),
        labels: g.labels || g.names || [],
        totals: Array.isArray(g.totals) && g.totals.some((t) => t !== '' && t != null) ? g.totals : null,
        rows: (g.athletes || []).map((a) => ({
          id: String(a.athlete?.id || ''),
          name: a.athlete?.shortName || a.athlete?.displayName || '',
          fullName: a.athlete?.displayName || '',
          pos: a.athlete?.position?.abbreviation || '',
          starter: a.starter === true,
          dnp: a.didNotPlay === true || !(a.stats || []).length,
          reason: a.didNotPlay ? a.reason || 'DNP' : '',
          stats: a.stats || [],
        })),
      }))
      .filter((g) => g.rows.length),
  }));

  return {
    game,
    players,
    boxscore,
    home,
    away,
    venue: summary?.gameInfo?.venue?.fullName || '',
    broadcast: sbComp?.broadcasts?.[0]?.names?.[0] || comp?.broadcasts?.[0]?.media?.shortName || '',
    situation: game?.isLive ? situationFrom(sbComp, summary?.drives, sides) : null,
    plays: plays.slice(-120).reverse(), // newest first
    teamStats,
  };
}
