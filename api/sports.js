// GET /api/sports?action=games&league=nba&date=2026-11-22
// GET /api/sports?action=roster&league=nba&team=20        (ESPN team id)
// GET /api/sports?action=box&league=nba&gameId=401910023  (ESPN event id)
// GET /api/sports?action=game&league=nfl&gameId=401873070&date=2026-11-22  (full game view)
//
// Live data from ESPN's public feeds, reshaped for the app. Only answers
// signed-in users so the endpoint isn't an open proxy.

import { requireUser } from './_auth.js';
import {
  LEAGUES,
  scoreboardUrl,
  summaryUrl,
  rosterUrl,
  normalizeScoreboard,
  normalizeSummary,
  normalizeRoster,
  normalizeDetail,
} from './_espn.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{1,12}$/;

export default async function handler(req, res) {
  try {
    if (!(await requireUser(req, res))) return;

    const { action, league, date, team, gameId } = req.query;
    if (!LEAGUES[league]) return res.status(400).json({ error: 'Unknown league' });

    // Full game view: summary + that day's scoreboard (for live situation).
    if (action === 'game' && ID_RE.test(gameId || '')) {
      const [sumRes, sbRes] = await Promise.all([
        fetch(summaryUrl(league, gameId)),
        DATE_RE.test(date || '') ? fetch(scoreboardUrl(league, date)) : Promise.resolve(null),
      ]);
      if (!sumRes.ok) return res.status(502).json({ error: `ESPN returned ${sumRes.status}` });
      const summary = await sumRes.json();
      const scoreboard = sbRes && sbRes.ok ? await sbRes.json().catch(() => null) : null;
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=5');
      return res.status(200).json(normalizeDetail(summary, scoreboard, gameId));
    }

    // A player who isn't on ESPN's roster page (practice-squad call-ups, recent signings):
    // look him up with ESPN's search. Returns [{ id, name, team }].
    if (action === 'findplayer') {
      const name = String(req.query.name || '').slice(0, 60);
      if (name.length < 3) return res.status(400).json({ error: 'Bad request' });
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json(await searchPlayer(league, name));
    }

    let url;
    let cacheSeconds;
    if (action === 'games' && DATE_RE.test(date || '')) {
      url = scoreboardUrl(league, date);
      cacheSeconds = 20;
    } else if (action === 'roster' && ID_RE.test(team || '')) {
      url = rosterUrl(league, team);
      cacheSeconds = 60 * 60 * 6;
    } else if (action === 'box' && ID_RE.test(gameId || '')) {
      url = summaryUrl(league, gameId);
      cacheSeconds = 10;
    } else {
      return res.status(400).json({ error: 'Bad request' });
    }

    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) return res.status(502).json({ error: `ESPN returned ${upstream.status}` });
    const raw = await upstream.json();

    let body;
    if (action === 'games') body = normalizeScoreboard(raw);
    else if (action === 'roster') body = normalizeRoster(raw);
    else body = normalizeSummary(raw, gameId);

    res.setHeader('Cache-Control', `s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`);
    return res.status(200).json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

// ESPN league ids inside athlete uids ("s:20~l:28~a:4430191")
const LEAGUE_UID = { nfl: '28', nba: '46', mlb: '10', cfb: '23', cbb: '41' };

async function searchPlayer(league, name) {
  const q = encodeURIComponent(name);
  const urls = [
    `https://site.web.api.espn.com/apis/common/v3/search?query=${q}&limit=10&type=player`,
    `https://site.api.espn.com/apis/search/v2?query=${q}&limit=10`,
  ];
  const found = new Map();
  for (const url of urls) {
    const data = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!data) continue;
    // Walk the reply and keep anything that looks like an athlete in this league
    const walk = (v, depth) => {
      if (!v || typeof v !== 'object' || depth > 7) return;
      if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
      const uid = String(v.uid || '');
      const m = uid.match(/l:(\d+)~a:(\d+)/);
      const display = v.displayName || v.name;
      if (m && display && m[1] === LEAGUE_UID[league]) {
        const team = v.team?.abbreviation || v.teamAbbreviation ||
          (Array.isArray(v.teamRelationships) ? v.teamRelationships[0]?.core?.abbreviation : '') || '';
        found.set(m[2], { id: m[2], name: display, team });
      } else if (!m && v.id && display && (v.type === 'player' || v.sport) && String(v.league || v.defaultLeagueSlug || '').toLowerCase().includes(league === 'cfb' ? 'college-football' : league)) {
        found.set(String(v.id), { id: String(v.id), name: display, team: v.team?.abbreviation || '' });
      }
      for (const k of Object.keys(v)) walk(v[k], depth + 1);
    };
    walk(data, 0);
    if (found.size) break;
  }
  return [...found.values()].slice(0, 5);
}
