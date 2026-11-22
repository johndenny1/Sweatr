// POST /api/scan  { image: <base64 jpeg>, today: "YYYY-MM-DD" }
// Sends a bet-slip screenshot to Claude and returns the legs it reads off it.
// Matching those legs to real games/players happens in the browser (src/lib/scan.js).

import { requireUser } from './_auth.js';

const STAT_IDS = `
NBA / college basketball (cbb): pts, reb, ast, pra (pts+reb+ast), pr (pts+reb), pa (pts+ast), 3pm, stl, blk
NFL / college football (cfb): passyds, passtd, rushyds, recyds, rec, rushrec (rush+rec yards), anytd (anytime touchdown), int (interceptions thrown)
MLB: h (hits), hr (home runs), rbi, r (runs), hrr (hits+runs+RBIs), tb (total bases), sb (stolen bases), k (pitcher strikeouts)`;

function prompt(today) {
  return `This is a screenshot of a sports betting slip (parlay). Today is ${today}.
Read every leg and return ONLY a JSON object, no other text, in this shape:

{
  "stake": number or null,          // amount wagered in dollars
  "odds": string or null,           // total parlay odds in American format, e.g. "+650"
  "legs": [
    {
      "league": "nfl" | "nba" | "mlb" | "cfb" | "cbb",
      "type": "prop" | "moneyline" | "spread" | "total",
      "player": string or null,     // full player name for props
      "team": string or null,       // standard abbreviation: the player's team (prop) or the picked team (moneyline/spread), e.g. "BOS", "KC", "LAD", "DUKE"
      "opponent": string or null,   // abbreviation of the other team if shown
      "stat": string or null,       // for props, one of the ids below
      "side": "over" | "under" | null,
      "line": number or null,       // prop/total line, or the spread for the picked team (e.g. -3.5)
      "date": "YYYY-MM-DD" or null, // game date if shown or clearly implied (e.g. "Tonight" = today)
      "raw": string                 // the leg's text as written on the slip
    }
  ]
}

Stat ids:${STAT_IDS}

Rules:
- "25+ points" or "To record 25+ points" means side "over", line 24.5. "Over 24.5" stays 24.5.
- "Anytime touchdown scorer" is stat "anytd", side "over", line 0.5.
- For a game total, put both teams in team/opponent.
- College games are "cfb" (football) or "cbb" (basketball).
- If a leg doesn't fit any type or stat id, still include it with your best guess and the raw text.
- If the image is not a bet slip, return {"stake": null, "odds": null, "legs": []}.`;
}


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    if (!(await requireUser(req, res))) return;

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel' });

    const { image, today } = req.body || {};
    if (typeof image !== 'string' || image.length < 100) return res.status(400).json({ error: 'No image received' });
    if (image.length > 5_500_000) return res.status(413).json({ error: 'Image too large' });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toISOString().slice(0, 10);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
              { type: 'text', text: prompt(day) },
            ],
          },
        ],
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({ error: data?.error?.message || `Claude API returned ${upstream.status}` });
    }

    const text = (data.content || []).map((c) => c.text || '').join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return res.status(502).json({ error: "Couldn't read that slip. Try a clearer screenshot." });
    }

    return res.status(200).json({
      stake: typeof parsed.stake === 'number' ? parsed.stake : null,
      odds: typeof parsed.odds === 'string' ? parsed.odds : null,
      legs: Array.isArray(parsed.legs) ? parsed.legs : [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
