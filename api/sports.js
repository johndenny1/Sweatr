// GET /api/sports?action=games&league=nba&date=2026-11-22
// GET /api/sports?action=roster&league=nba&team=BOS
// GET /api/sports?action=box&league=nba&gameId=12345
//
// Proxies SportsDataIO so the API key never reaches the browser, and only
// answers signed-in users so strangers can't burn through your paid quota.

import { createClient } from '@supabase/supabase-js';
import { LEAGUES, apiKeyFor, normalizeGame, normalizeBox, normalizePlayer } from './_sportsdata.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEAM_RE = /^[A-Za-z0-9]{1,10}$/;
const ID_RE = /^\d{1,12}$/;

export default async function handler(req, res) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user) return res.status(401).json({ error: 'Session expired' });

    const { action, league, date, team, gameId } = req.query;
    const cfg = LEAGUES[league];
    if (!cfg) return res.status(400).json({ error: 'Unknown league' });

    const key = apiKeyFor(league);
    if (!key) return res.status(500).json({ error: `No SportsDataIO key set for ${league.toUpperCase()}` });

    let path;
    let cacheSeconds;
    if (action === 'games' && DATE_RE.test(date || '')) {
      path = cfg.games(date);
      cacheSeconds = 30;
    } else if (action === 'roster' && TEAM_RE.test(team || '')) {
      path = cfg.roster(team);
      cacheSeconds = 60 * 60 * 6;
    } else if (action === 'box' && ID_RE.test(gameId || '')) {
      path = cfg.box(gameId);
      cacheSeconds = 15;
    } else {
      return res.status(400).json({ error: 'Bad request' });
    }

    const upstream = await fetch(`https://api.sportsdata.io${path}`, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `SportsDataIO returned ${upstream.status} for ${path}` });
    }
    const raw = await upstream.json();

    let body;
    if (action === 'games') body = (raw || []).map(normalizeGame);
    else if (action === 'roster') body = (raw || []).map(normalizePlayer).filter((p) => p.active);
    else body = normalizeBox(raw);

    // Short cache window so a burst of refreshes doesn't hit SportsDataIO every time.
    res.setHeader('Cache-Control', `s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`);
    return res.status(200).json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
