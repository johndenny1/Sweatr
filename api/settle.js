// POST /api/settle  { id }
// Grades a slip on the server from ESPN box scores and saves the result.
// Users can't write status/payout themselves (the database blocks it), so
// every win and loss on a profile comes from here.

import { requireUser } from './_auth.js';
import { admin, hasAdmin } from './_admin.js';
import { summaryUrl, normalizeSummary } from './_espn.js';
import { evaluateLeg, parlayStatus } from '../src/lib/evaluate.js';
import { payoutFor } from '../src/lib/money.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!hasAdmin) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set in Vercel' });

    const id = String(req.body?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Bad id' });

    const { data: p, error } = await admin.from('parlays').select('*').eq('id', id).eq('user_id', user.id).single();
    if (error || !p) return res.status(404).json({ error: 'Slip not found' });
    if (p.status === 'won' || p.status === 'lost') return res.status(200).json({ status: p.status, payout: p.payout });

    const cache = {};
    const box = async (league, gameId) => {
      const k = `${league}:${gameId}`;
      if (!cache[k]) {
        cache[k] = fetch(summaryUrl(league, gameId))
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (j ? normalizeSummary(j, gameId) : null))
          .catch(() => null);
      }
      return cache[k];
    };

    const results = await Promise.all(
      (p.legs || []).map(async (leg) => {
        const b = await box(leg.league, leg.gameId);
        return evaluateLeg(leg, b?.game, b?.players);
      })
    );
    const status = parlayStatus(results);
    if (status !== 'won' && status !== 'lost') return res.status(200).json({ status });

    const payout = status === 'won' ? payoutFor(p.stake, p.odds) : 0;
    await admin.from('parlays').update({ status, payout, settled_at: new Date().toISOString() }).eq('id', id);
    return res.status(200).json({ status, payout });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
