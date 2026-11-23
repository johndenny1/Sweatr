// POST /api/scout  { legs, odds, stake }
// "Scout this slip": real recent numbers for every leg (last 5 games vs. the line, team form,
// injuries, weather), then a short written take on each leg and the slip as a whole.
import { requireUser } from './_auth.js';
import { gatherScout } from './_scout-data.js';
import { askGemini } from './_gemini.js';
import { americanToDecimal } from '../src/lib/money.js';

export const config = { maxDuration: 60 };

const RATINGS = ['strong', 'okay', 'risky'];
const OVERALL = ['Strong', 'Decent', 'Shaky', 'Long shot'];

function prompt(data, odds) {
  const dec = americanToDecimal(odds);
  const price = dec ? `The slip's odds are ${odds}, so the book is pricing it around 1 in ${Math.round(dec)}.` : '';
  return `You are the scout inside Sweatr, a sports-betting slip tracker. Someone is about to place this parlay and wants a quick, honest read on it. ${price}

Here is everything we know, as JSON. "recent" lists the player's last 5 games (value null = didn't play). "hits" = how many of those cleared the line on the side they picked. Team legs show each team's last 5 results and scoring averages. Injuries and weather come from the game page.

${JSON.stringify(data)}

Write the report as ONLY a JSON object:
{
  "overall": "Strong" | "Decent" | "Shaky" | "Long shot",
  "headline": string,          // max 12 words, casual, specific to this slip
  "summary": string,           // 2-3 sentences on the slip as a whole
  "legs": [ { "i": number, "rating": "strong" | "okay" | "risky", "take": string, "reasons": [string] } ],
  "watch": [string]            // up to 3 things to keep an eye on (weather, injuries, legs that depend on each other)
}

Rules:
- Use ONLY numbers that are in the data. Never invent stats, matchups, trends or news. If something isn't in the data, don't mention it.
- No hit percentages or win probabilities of your own. Talk in counts and averages ("cleared 4 of his last 5, averaging 71").
- "take" is one short sentence. "reasons" are 1-3 short bullet-style phrases, each tied to a number or fact from the data.
- Rating guide: props that cleared the line in 4-5 of the last 5 with no injury concern lean "strong"; 2-3 lean "okay"; 0-1, an injury tag, or bad weather for that stat lean "risky". Team legs: weigh recent results and scoring averages.
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
    let rating = 'okay';
    const reasons = [];
    if (l.games) {
      reasons.push(`Cleared it in ${l.hits} of his last ${l.games}${l.avg != null ? `, averaging ${l.avg}` : ''}`);
      rating = l.hits >= 4 ? 'strong' : l.hits <= 1 ? 'risky' : 'okay';
    }
    if (l.injury) {
      reasons.push(`Listed as ${l.injury.status}`);
      rating = 'risky';
    }
    return { i: l.i, rating, take: reasons[0] || 'Not enough recent data to say much.', reasons: reasons.slice(1) };
  });
  const n = data.legs.length;
  const risky = legs.filter((l) => l.rating === 'risky').length;
  const overall = n >= 8 ? 'Long shot' : risky >= 2 ? 'Shaky' : risky ? 'Decent' : 'Strong';
  return { overall, headline: `${n} legs, ${risky} that look shaky`, summary: '', legs, watch: [] };
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
        rating: RATINGS.includes(a.rating) ? a.rating : fb.legs[idx].rating,
        take: String(a.take || fb.legs[idx].take).slice(0, 200),
        reasons: (Array.isArray(a.reasons) ? a.reasons : fb.legs[idx].reasons).slice(0, 3).map((r) => String(r).slice(0, 160)),
      };
    }),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { legs, odds } = req.body || {};
    if (!Array.isArray(legs) || !legs.length || legs.length > 25) return res.status(400).json({ error: 'Add some legs first' });
    const ok = legs.every((l) => l && /^\d{1,12}$/.test(String(l.gameId)) && ['nfl', 'nba', 'mlb', 'cfb', 'cbb'].includes(l.league));
    if (!ok) return res.status(400).json({ error: 'Some legs are missing their game' });

    const data = await gatherScout(legs);

    let report = null;
    if (process.env.GEMINI_API_KEY) {
      const r = await askGemini(process.env.GEMINI_API_KEY, [], prompt(data, odds), {
        temperature: 0.4,
        busyMessage: 'The scout is busy right now. Try again in a minute.',
      });
      if (r.text) {
        const t = r.text.replace(/```(?:json)?/gi, '');
        try {
          report = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
        } catch {
          report = null;
        }
      }
    }
    return res.status(200).json({ report: clean(report, data), data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
