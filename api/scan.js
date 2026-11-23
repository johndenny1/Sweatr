// POST /api/scan  { images: [<base64 jpeg>, …] (or image), today: "YYYY-MM-DD" }
// Sends one or more screenshots of the same bet slip to Gemini (free tier) or Claude and returns the legs it reads off it.
// Matching those legs to real games/players happens in the browser (src/lib/scan.js).

import { requireUser } from './_auth.js';
import { admin, hasAdmin, sign, sha256 } from './_admin.js';
import { legFingerprint } from '../src/lib/fingerprint.js';
import { dedupeLegs } from './_dedupe.js';

const STAT_IDS = `
NBA / college basketball (cbb): pts, reb, ast, pra (pts+reb+ast), pr (pts+reb), pa (pts+ast), 3pm, stl, blk
NFL / college football (cfb): passyds, passtd, rushyds, recyds, rec, rushrec (rush+rec yards), anytd (anytime touchdown), int (interceptions thrown)
MLB: h (hits), hr (home runs), rbi, r (runs), hrr (hits+runs+RBIs), bb (walks), k (pitcher strikeouts)`;

function prompt(today, count = 1) {
  const intro =
    count > 1
      ? `These ${count} screenshots are all of the SAME sports betting slip (parlay), in order, taken while scrolling because it was too long for one screen. They usually overlap: the bottom of one screenshot shows the same legs as the top of the next. Today is ${today}.
Combine them into ONE slip. List every leg exactly ONCE, in slip order, even if it shows up in two screenshots. If a leg is cut off at the edge of one screenshot but complete in another, use the complete one. The stake, odds and payout may only appear in one of the screenshots.`
      : `This is a screenshot of a sports betting slip (parlay). Today is ${today}.`;
  return `${intro}
Read every leg and return ONLY a JSON object, no other text, in this shape:

{
  "stake": number or null,          // amount wagered in dollars
  "odds": string or null,           // total parlay odds in American format, e.g. "+650", if shown
  "payout": number or null,         // total return if it hits (e.g. "Max payout", "Potential payout", "To pay"), stake included
  "legs": [
    {
      "league": "nfl" | "nba" | "mlb" | "cfb" | "cbb",
      "type": "prop" | "moneyline" | "spread" | "total",
      "player": string or null,     // full player name for props
      "matchup": string or null,    // the game this leg is listed under, exactly as printed (e.g. "MIL Bucks vs TOR Raptors")
      "team": string or null,       // abbreviation of the player's team (prop) or the picked team (moneyline/spread), ONLY if printed on the slip; never guess from memory
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
- Rosters change; do not fill in a player's team from memory. Use the matchup heading the leg sits under instead.
- If a leg doesn't fit any type or stat id, still include it with your best guess and the raw text.
- Prediction markets (Kalshi, Polymarket, etc.) show "Cost" (that's the stake) and "Max payout" (that's the payout) instead of odds. Percentages next to legs are prices, not lines.
- If the image is not a bet slip, return {"stake": null, "odds": null, "payout": null, "legs": []}.`;
}


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!geminiKey && !anthropicKey) {
      return res.status(500).json({ error: 'Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in Vercel' });
    }

    const { image, images: list, today } = req.body || {};
    const images = (Array.isArray(list) ? list : [image]).filter((x) => typeof x === 'string' && x.length >= 100);
    if (!images.length) return res.status(400).json({ error: 'No image received' });
    if (images.length > MAX_IMAGES) return res.status(400).json({ error: `Up to ${MAX_IMAGES} screenshots per slip` });
    if (images.reduce((n, x) => n + x.length, 0) > 4_200_000) return res.status(413).json({ error: 'Screenshots too large' });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toISOString().slice(0, 10);

    const result = geminiKey
      ? await askGemini(geminiKey, images, prompt(day, images.length))
      : await askClaude(anthropicKey, images, prompt(day, images.length));
    if (result.error) return res.status(502).json({ error: result.error });

    const text = result.text;
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return res.status(502).json({ error: "Couldn't read that slip. Try a clearer screenshot." });
    }

    const stake = typeof parsed.stake === 'number' ? parsed.stake : null;
    let odds = typeof parsed.odds === 'string' && /\d/.test(parsed.odds) ? parsed.odds : null;
    // Slips that show cost + payout (Kalshi, etc.) instead of odds: work out the American odds.
    const payout = typeof parsed.payout === 'number' ? parsed.payout : null;
    if (!odds && stake > 0 && payout > stake) {
      const dec = payout / stake;
      odds = dec >= 2 ? `+${Math.round((dec - 1) * 100)}` : `-${Math.round(100 / (dec - 1))}`;
    }
    // Overlapping screenshots: never keep the same leg twice, even if the AI repeats it
    const legs = dedupeLegs(Array.isArray(parsed.legs) ? parsed.legs : []);

    // Signed receipt of exactly what was read off the image. /api/save checks the
    // saved slip against it, so stake, odds and lines can't be changed afterwards.
    // One screenshot: its own hash (same as before). Several: a hash of all of them, plus each one's
    // hash so a screenshot already used for another slip is still caught.
    const hashes = images.map((x) => sha256(x));
    const imageHash = hashes.length === 1 ? hashes[0] : sha256(hashes.slice().sort().join('|'));
    let duplicate = false;
    if (hasAdmin) {
      const { data } = await admin.from('parlays').select('id').in('image_hash', [...new Set([imageHash, ...hashes])]).limit(1);
      duplicate = Boolean(data?.length);
    }
    const token = hasAdmin
      ? sign({ u: user.id, h: imageHash, hs: hashes.length > 1 ? hashes : undefined, s: stake, o: odds, l: legs.map(legFingerprint), t: Date.now() })
      : null;

    return res.status(200).json({ stake, odds, legs, token, duplicate });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

const MAX_IMAGES = 4;

// Google Gemini — has a free tier (free-tier requests may be used by Google to improve its products).
// Free models get overloaded at busy times, so retry once and then fall back to other free models.
const GEMINI_FALLBACKS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiOnce(key, model, images, text, fast = true) {
  const generationConfig = { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 4096 };
  // Reading a slip doesn't need the model to "think" first; skipping it saves seconds.
  if (fast) generationConfig.thinkingConfig = /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [...images.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })), { text }] }],
      generationConfig,
    }),
  });
  const data = await r.json().catch(() => ({}));
  // Model doesn't support that thinking setting: retry once without it.
  if (!r.ok && fast && r.status === 400 && /thinking/i.test(data?.error?.message || '')) return geminiOnce(key, model, images, text, false);
  if (!r.ok) return { status: r.status, error: data?.error?.message || `Gemini returned ${r.status}` };
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return { text: parts.map((p) => p.text || '').join('') };
}

async function askGemini(key, images, text) {
  const models = [...new Set([process.env.GEMINI_MODEL, ...GEMINI_FALLBACKS].filter(Boolean))];
  let last = null;
  for (const [i, model] of models.entries()) {
    for (let attempt = 0; attempt < (i === 0 ? 2 : 1); attempt++) {
      const result = await geminiOnce(key, model, images, text);
      if (result.text) return result;
      last = result;
      // Busy / rate-limited / server error → try again or move on. 404 = model name not available → move on.
      if (![429, 500, 502, 503, 504, 404].includes(result.status)) return { error: result.error };
      if (attempt === 0 && i === 0) await sleep(600);
    }
  }
  return {
    error:
      last?.status === 429
        ? 'Free scan limit hit for now. Try again in a minute.'
        : "Google's free scanner is busy right now. Try again in a minute, or add the legs by hand.",
  };
}

// Anthropic Claude — paid, used if no Gemini key is set.
async function askClaude(key, images, text) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
            { type: 'text', text },
          ],
        },
      ],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: data?.error?.message || `Claude API returned ${r.status}` };
  return { text: (data.content || []).map((c) => c.text || '').join('') };
}
