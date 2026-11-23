// POST /api/scout  { legs, odds, stake }
// "Scout this slip": real recent numbers for every leg (last 5 games vs. the line, team form,
// injuries, weather), then a short written take on each leg and the slip as a whole.
import { requireUser } from './_auth.js';
import { gatherScout } from './_scout-data.js';
import { askGemini } from './_gemini.js';
import { americanToDecimal } from '../src/lib/money.js';

export const config = { maxDuration: 60 };

const RATINGS = ['strong', 'fair', 'weak'];
const LEGACY = { okay: 'fair', risky: 'weak' };
const OVERALL = ['Strong', 'Decent', 'Shaky', 'Long shot'];

// Faster models first: the scout writes short text, it doesn't need the big ones
const FAST_MODELS = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'];

// Only what the writer needs, so the prompt stays small (and quick)
function compact(data) {
  return {
    games: data.games.map((g) => ({
      matchup: g.matchup,
      weather: g.weather,
      indoor: g.indoor,
      records: g.records,
      out: g.injuries.map((x) => `${x.team} ${x.name} (${x.status}${x.detail ? `, ${x.detail}` : ''})`).slice(0, 10),
    })),
    legs: data.legs.map((l) => ({
      i: l.i,
      leg: l.desc,
      game: l.game,
      ...(l.recent ? { last5: l.recent.map((r) => r.value), hits: l.hits, games: l.games, avg: l.avg } : {}),
      ...(l.injury ? { injury: `${l.injury.status}${l.injury.detail ? ` (${l.injury.detail})` : ''}` } : {}),
      ...(l.news?.length ? { news: l.news.map((a) => a.headline) } : {}),
      ...(l.teams ? { teams: l.teams.map((t) => ({ team: t.team, record: t.record, last5: t.last5, avgFor: t.avgFor, avgAgainst: t.avgAgainst })) } : {}),
    })),
  };
}

function briefPrompt(data, odds) {
  const dec = americanToDecimal(odds);
  const price = dec ? `The slip's odds are ${odds} (the book prices it around 1 in ${Math.round(dec)}).` : '';
  return `You are the scout inside Sweatr, a bet-slip tracker. Give a FAST first read on this parlay. ${price}
Data (last5 = the player's last 5 values, newest first, null = didn't play; hits = how many cleared the line):
${JSON.stringify(compact(data))}

Return ONLY JSON:
{"overall":"Strong"|"Decent"|"Shaky"|"Long shot","headline":string,"watch":[string],"ratings":[{"i":number,"r":"strong"|"fair"|"weak"}]}

Rules: headline max 12 words, casual and specific. watch = up to 3 short things to keep an eye on (weather, injuries, legs that depend on each other), MOST important first, each under 15 words. Use only facts in the data, no hit percentages. Props clearing 4-5 of 5 with no injury lean strong, 2-3 fair, 0-1 or an injury tag weak. 10+ legs is usually a Long shot. Rate every leg.`;
}

function prompt(data, odds) {
  const dec = americanToDecimal(odds);
  const price = dec ? `The slip's odds are ${odds}, so the book is pricing it around 1 in ${Math.round(dec)}.` : '';
  return `You are the scout inside Sweatr, a sports-betting slip tracker. Someone is about to place this parlay and wants a quick, honest read on it. ${price}

Here is everything we know, as JSON. "recent" lists the player's last 5 games (value null = didn't play). "hits" = how many of those cleared the line on the side they picked. Team legs show each team's last 5 results and scoring averages. Injuries and weather come from the game page.

${JSON.stringify(compact(data))}

Write the report as ONLY a JSON object:
{
  "overall": "Strong" | "Decent" | "Shaky" | "Long shot",
  "headline": string,          // max 12 words, casual, specific to this slip
  "summary": string,           // 2-3 sentences on the slip as a whole
  "legs": [ { "i": number, "rating": "strong" | "fair" | "weak", "take": string, "reasons": [string] } ],
  "watch": [string]            // up to 3 things to keep an eye on (weather, injuries, legs that depend on each other), most important first
}

Rules:
- Use ONLY numbers that are in the data. Never invent stats, matchups, trends or news. If something isn't in the data, don't mention it.
- No hit percentages or win probabilities of your own. Talk in counts and averages ("cleared 4 of his last 5, averaging 71").
- "take" is one short sentence. "reasons" are 1-3 short bullet-style phrases, each tied to a number or fact from the data.
- Rating guide: props that cleared the line in 4-5 of the last 5 with no injury concern lean "strong"; 2-3 lean "fair"; 0-1, an injury tag, or bad weather for that stat lean "weak". Team legs: weigh recent results and scoring averages.
- "news" holds real ESPN headlines that mention the player. Use one ONLY if it changes whether he plays or how much: a suspension, league discipline, an arrest or charge reported in the headline, a trade, a new role, or time away from the team. Repeat only what the headline says, and say it came from ESPN. Never mention or guess about relationships, family, mental health or rumors, and never infer anything beyond the headline.
- Injury entries with a type like "Suspension" or "Personal" count as availability news.
- Weather matters for outdoor football: gusts of 15+ mph or rain/snow hurt passing and kicking. If weather is null, say nothing about weather.
- Point out legs that depend on each other in the same game (like a QB's passing yards and his receiver's yards) or that pull against each other.
- For the overall rating, remember every extra leg makes the whole slip harder to hit, so a 10+ leg slip is usually a "Long shot" even with good legs. Say that plainly, without lecturing.
- Sound like a friend who watches a lot of games: casual, short, specific. No hype, no "lock", no telling them to bet or not bet.
- Include every leg, in order, using its "i".`;
}

// No AI available: simple rules from the same numbers
function fallback(data) {
  const legs = data.legs.map((l) => {
    let rating = 'fair';
    const reasons = [];
    if (l.games) {
      reasons.push(`Cleared it in ${l.hits} of his last ${l.games}${l.avg != null ? `, averaging ${l.avg}` : ''}`);
      rating = l.hits >= 4 ? 'strong' : l.hits <= 1 ? 'weak' : 'fair';
    }
    if (l.injury) {
      reasons.push(`Listed as ${l.injury.status}`);
      rating = 'weak';
    }
    return { i: l.i, rating, take: reasons[0] || 'Not enough recent data to say much.', reasons: reasons.slice(1) };
  });
  const n = data.legs.length;
  const weak = legs.filter((l) => l.rating === 'weak').length;
  const overall = n >= 8 ? 'Long shot' : weak >= 2 ? 'Shaky' : weak ? 'Decent' : 'Strong';
  return { overall, headline: `${n} legs, ${weak} that look weak`, summary: '', legs, watch: [] };
}

function clean(ai, data) {
  if (!ai || typeof ai !== 'object') return fallback(data);
  const byI = new Map((Array.isArray(ai.legs) ? ai.legs : []).map((l) => [Number(l.i), l]));
  const fb = fallback(data);
  return {
    overall: OVERALL.includes(ai.overall) ? ai.overall : fb.overall,
    headline: String(ai.headline || fb.headline).slice(0, 120),
    summary: String(ai.summary || '').slice(0, 600),
    watch: (Array.isArray(ai.watch) ? ai.watch : []).slice(0, 3).map((w) => String(w).slice(0, 200)),
    legs: data.legs.map((l, idx) => {
      const a = byI.get(l.i) || {};
      return {
        i: l.i,
        rating: RATINGS.includes(LEGACY[a.rating] || a.rating) ? LEGACY[a.rating] || a.rating : fb.legs[idx].rating,
        take: String(a.take || fb.legs[idx].take).slice(0, 200),
        reasons: (Array.isArray(a.reasons) ? a.reasons : fb.legs[idx].reasons).slice(0, 3).map((r) => String(r).slice(0, 160)),
      };
    }),
  };
}

function readJson(text) {
  if (!text) return null;
  const t = String(text).replace(/```(?:json)?/gi, '');
  try {
    return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { legs, odds, mode, data: given, ratings } = req.body || {};

    // Second pass: the full write-up, from the data the first pass already gathered
    if (mode === 'full') {
      if (!given || !Array.isArray(given.legs)) return res.status(400).json({ error: 'Missing data' });
      let full = null;
      if (process.env.GEMINI_API_KEY) {
        const keep = Array.isArray(ratings) && ratings.length ? `\nKeep these ratings exactly: ${JSON.stringify(ratings)}` : '';
        const r = await askGemini(process.env.GEMINI_API_KEY, [], prompt(given, odds) + keep, { temperature: 0.4, models: FAST_MODELS });
        full = readJson(r.text);
      }
      return res.status(200).json({ report: clean(full, given) });
    }

    if (!Array.isArray(legs) || !legs.length || legs.length > 25) return res.status(400).json({ error: 'Add some legs first' });
    const ok = legs.every((l) => l && /^\d{1,12}$/.test(String(l.gameId)) && ['nfl', 'nba', 'mlb', 'cfb', 'cbb'].includes(l.league));
    if (!ok) return res.status(400).json({ error: 'Some legs are missing their game' });

    const t0 = Date.now();
    const data = await gatherScout(legs);
    const t1 = Date.now();

    // First pass: verdict, headline, watch list and a rating per leg (short output = fast)
    let brief = null;
    if (process.env.GEMINI_API_KEY) {
      const r = await askGemini(process.env.GEMINI_API_KEY, [], briefPrompt(data, odds), {
        temperature: 0.3,
        maxOutputTokens: 1500,
        models: FAST_MODELS,
        busyMessage: 'The scout is busy right now. Try again in a minute.',
      });
      brief = readJson(r.text);
    }
    const asReport = brief
      ? {
          overall: brief.overall,
          headline: brief.headline,
          watch: brief.watch,
          legs: (brief.ratings || []).map((x) => ({ i: x.i, rating: x.r })),
        }
      : null;
    const report = clean(asReport, data);
    report.partial = true; // takes and reasons come from the second pass
    return res.status(200).json({ report, data, ms: { data: t1 - t0, ai: Date.now() - t1 } });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
