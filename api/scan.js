// POST /api/scan  { images: [<base64 jpeg>, …] (or image), today: "YYYY-MM-DD" }
// Sends one or more screenshots of the same bet slip to Gemini (free tier) or Claude and returns the legs it reads off it.
// Matching those legs to real games/players happens in the browser (src/lib/scan.js).

import { requireUser } from './_auth.js';
import { admin, hasAdmin, sign, sha256 } from './_admin.js';
import { legFingerprint } from '../src/lib/fingerprint.js';
import { dedupeLegs } from './_dedupe.js';
import { parseSlipReply } from './_parseSlip.js';
import { askGemini } from './_gemini.js';
import { normalizeTeamProp } from '../src/lib/teamProps.js';

const STAT_IDS = `
NBA / college basketball (cbb): pts, reb, ast, pra (pts+reb+ast), pr (pts+reb), pa (pts+ast), 3pm, stl, blk
NFL / college football (cfb): dsttd (team D/ST touchdowns, teamprop only), passyds, passtd, rushyds, recyds, rec, rushrec (rush+rec yards), anytd (anytime touchdown), firsttd (first touchdown scorer of the game), int (interceptions thrown)
MLB: h (hits), hr (home runs), rbi, r (runs), hrr (hits+runs+RBIs), bb (walks), k (pitcher strikeouts)`;

function prompt(today, count = 1) {
  const intro =
    count > 1
      ? `These ${count} screenshots are all of the SAME sports betting slip (parlay), in order, taken while scrolling because it was too long for one screen. They usually overlap: the bottom of one screenshot shows the same legs as the top of the next. Today is ${today}.
Combine them into ONE slip and return ONE JSON object (not one per screenshot). List every leg exactly ONCE, in slip order, even if it shows up in two screenshots. If a leg is cut off at the edge of one screenshot but complete in another, use the complete one. The stake, odds and payout may only appear in one of the screenshots.`
      : `This is a screenshot of a sports betting slip (parlay). Today is ${today}.`;
  return `${intro}
Read every leg and return ONLY a JSON object, no other text, in this shape:

{
  "stake": number or null,          // amount wagered in dollars
  "odds": string or null,           // total parlay odds in American format, e.g. "+650", if shown
  "payout": number or null,         // total return if it hits (e.g. "Max payout", "Potential payout", "To pay"), stake included
  "placed": true | false | null,    // has this bet actually been placed? (see rules)
  "placed_evidence": string or null, // the words/buttons on screen that show it, e.g. "Cash out button", "Bet ID 4821", "Place bet button"
  "ticket_id": string or null,      // bet/ticket/order/receipt ID if one is shown, exactly as printed
  "legs": [
    {
      "league": "nfl" | "nba" | "mlb" | "cfb" | "cbb",
      "type": "prop" | "teamprop" | "moneyline" | "spread" | "total",
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
- "First touchdown scorer" / "First TD" is stat "firsttd", side "over", line 0.5. ("Last TD" and "2+ TDs" are not firsttd.)
- For a game total, put both teams in team/opponent.
- College games are "cfb" (football) or "cbb" (basketball).
- Rosters change; do not fill in a player's team from memory. Use the matchup heading the leg sits under instead.
- If a leg doesn't fit any type or stat id, still include it with your best guess and the raw text.
- "Yes" on a leg means side "over"; "No" means side "under" (e.g. "No · Bengals D/ST: 1+ touchdowns" = under 0.5).
- A team defense / special teams touchdown leg ("D/ST", "Defense/ST", "defensive or return TD") is type "teamprop", stat "dsttd", team = that team's abbreviation, player null, line 0.5 for "1+".
- Prediction markets (Kalshi, Polymarket, etc.) show "Cost" (that's the stake) and "Max payout" (that's the payout) instead of odds. Percentages next to legs are prices, not lines.
- "placed": true when the screen shows a bet that already exists: a bet/ticket/order ID, "Bet placed", "Open position", "Open bets"/"My bets", a Cash out / Sell button, a "Current value", or a placed date/time. false when it shows a slip still being built: a "Place bet", "Review", "Submit", "Confirm", "Add to betslip" or "Buy" button, or an editable stake box. null if you can't tell.
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
    const parsed = parseSlipReply(text);
    if (!parsed) {
      console.error('scan: unreadable reply', String(text).slice(0, 500));
      return res.status(502).json({ error: "Couldn't read that slip. Try again, or one screenshot at a time." });
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
    const placed = parsed.placed === true ? true : parsed.placed === false ? false : null;
    const ticket = typeof parsed.ticket_id === 'string' ? parsed.ticket_id.replace(/\s+/g, '').toUpperCase() : '';
    const legs = dedupeLegs((Array.isArray(parsed.legs) ? parsed.legs : []).map(normalizeTeamProp));

    // Signed receipt of exactly what was read off the image. /api/save checks the
    // saved slip against it, so stake, odds and lines can't be changed afterwards.
    // One screenshot: its own hash (same as before). Several: a hash of all of them, plus each one's
    // hash so a screenshot already used for another slip is still caught.
    const hashes = images.map((x) => sha256(x));
    // A bet/ticket ID is the strongest fingerprint: the same bet can only be verified once, by anyone,
    // even from a different screenshot of it.
    const ticketHash = ticket.length >= 5 ? sha256(`ticket:${ticket}`) : null;
    const imageHash = ticketHash || (hashes.length === 1 ? hashes[0] : sha256(hashes.slice().sort().join('|')));
    let duplicate = false;
    if (hasAdmin) {
      const { data } = await admin.from('parlays').select('id').in('image_hash', [...new Set([imageHash, ...hashes, ...(ticketHash ? [ticketHash] : [])])]).limit(1);
      duplicate = Boolean(data?.length);
    }
    const token = hasAdmin
      ? sign({
          u: user.id,
          h: imageHash,
          hs: hashes.length > 1 || ticketHash ? hashes : undefined,
          p: placed,
          s: stake,
          o: odds,
          l: legs.map(legFingerprint),
          t: Date.now(),
        })
      : null;

    return res.status(200).json({ stake, odds, legs, token, duplicate, placed, placedEvidence: parsed.placed_evidence || null });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

const MAX_IMAGES = 4;

// Anthropic Claude — paid, used if no Gemini key is set.
async function askClaude(key, images, text) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 8000,
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
