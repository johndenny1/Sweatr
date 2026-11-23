// POST /api/save  { name, stake, odds, legs, token }
// Saves a slip and decides, on the server, whether it's Verified:
//   1. it came from a scan (signed receipt from /api/scan, same user, < 2h old)
//   2. legs, stake and odds match what was read off the screenshot
//   3. the screenshot hasn't been used before, and the slip isn't a duplicate
//   4. none of its games had started when it was saved
//   5. the odds are plausible for the number of legs
// Anything that fails is still saved, just as Unverified (with the reason).

import { requireUser } from './_auth.js';
import { admin, hasAdmin, verify, sha256 } from './_admin.js';
import { LEAGUES, summaryUrl, normalizeSummary } from './_espn.js';
import { legsMatchScan, sameOdds, sameStake, legFingerprint } from '../src/lib/fingerprint.js';
import { americanToDecimal } from '../src/lib/money.js';

const TYPES = new Set(['prop', 'moneyline', 'spread', 'total']);

function cleanLegs(legs) {
  if (!Array.isArray(legs) || !legs.length || legs.length > 25) return null;
  for (const l of legs) {
    if (!l || !LEAGUES[l.league] || !/^\d{1,12}$/.test(String(l.gameId)) || !TYPES.has(l.type)) return null;
  }
  return legs;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!hasAdmin) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set in Vercel', fallback: true });

    const { name, stake, odds, token } = req.body || {};
    const legs = cleanLegs(req.body?.legs);
    if (!legs) return res.status(400).json({ error: 'Slip needs at least one valid leg' });

    const notes = [];
    const receipt = verify(token);
    const fromScan = receipt && receipt.u === user.id;

    // 1–2. Matches the scan
    if (!fromScan) notes.push('Added by hand');
    else if (Date.now() - receipt.t > 2 * 60 * 60 * 1000) notes.push('Scan expired, rescan the slip');
    else if (!legsMatchScan(legs, receipt.l)) notes.push('Legs were changed after the scan');
    else if (receipt.s == null) notes.push("Stake wasn't readable on the slip");
    else if (!sameStake(stake, receipt.s)) notes.push("Stake doesn't match the slip");
    else if (!sameOdds(odds, receipt.o)) notes.push("Odds don't match the slip");

    // 3. Screenshot reuse + duplicate slip
    let imageHash = fromScan ? receipt.h : null;
    if (imageHash) {
      const { data } = await admin.from('parlays').select('id').eq('image_hash', imageHash).limit(1);
      if (data?.length) {
        notes.push('This screenshot was already used');
        imageHash = null;
      }
    }
    const slipKey = sha256(
      JSON.stringify([
        user.id,
        Number(stake) || 0,
        String(odds || ''),
        legs.map((l) => `${l.league}:${l.gameId}:${legFingerprint(l)}:${l.playerId || l.pick || ''}`).sort(),
      ])
    );
    const { data: dupe } = await admin.from('parlays').select('id').eq('user_id', user.id).eq('slip_key', slipKey).limit(1);
    if (dupe?.length) notes.push('You already saved this slip');

    // 4. Kickoff lock — check every game's live status with ESPN right now.
    const games = [...new Map(legs.map((l) => [`${l.league}:${l.gameId}`, l])).values()];
    const states = await Promise.all(
      games.map(async (l) => {
        try {
          const r = await fetch(summaryUrl(l.league, l.gameId));
          if (!r.ok) return null;
          return normalizeSummary(await r.json(), l.gameId).game;
        } catch {
          return null;
        }
      })
    );
    if (states.some((g) => !g)) notes.push("Couldn't confirm a game's start time");
    else if (states.some((g) => g.isLive || g.isFinal)) notes.push('Added after a game had started');
    const starts = states.map((g) => g?.start).filter(Boolean).sort();
    const firstStart = starts[0] || null;

    // 5. Odds sanity for the number of legs
    const dec = americanToDecimal(odds);
    if (dec && (dec < 1.01 || dec > Math.min(Math.pow(15, legs.length), 1_000_000))) notes.push('Odds look off for this many legs');

    const verified = notes.length === 0;
    const { data, error } = await admin
      .from('parlays')
      .insert({
        user_id: user.id,
        name: String(name || '').trim().slice(0, 60) || `${legs.length}-leg parlay`,
        stake: Number(stake) > 0 ? Number(stake) : null,
        odds: odds ? String(odds).slice(0, 12) : null,
        legs,
        verified,
        verify_note: notes[0] || null,
        image_hash: imageHash,
        slip_key: slipKey,
        first_start: firstStart,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ id: data.id, verified, note: notes[0] || null });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
