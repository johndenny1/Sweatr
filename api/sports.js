// GET /api/sports?action=games&league=nba&date=2026-11-22
// GET /api/sports?action=roster&league=nba&team=20        (ESPN team id)
// GET /api/sports?action=box&league=nba&gameId=401910023  (ESPN event id)
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
} from './_espn.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{1,12}$/;

export default async function handler(req, res) {
  try {
    if (!(await requireUser(req, res))) return;

    const { action, league, date, team, gameId } = req.query;
    if (!LEAGUES[league]) return res.status(400).json({ error: 'Unknown league' });

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
