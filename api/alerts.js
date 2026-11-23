// POST/GET /api/alerts — run every minute by Supabase (pg_cron, see supabase/push.sql).
// Checks open slips for people with alerts on, sends funny pushes for new hits / misses /
// close calls / cashes, and settles slips that are decided.
import { admin, hasAdmin } from './_admin.js';
import { summaryUrl, normalizeSummary } from './_espn.js';
import { sendPush } from './_push.js';
import { slipKeys, chooseAlerts } from './_alerts-core.js';
import { payoutFor } from '../src/lib/money.js';
import crypto from 'node:crypto';

async function authorized(req) {
  const given = String(req.headers['x-cron-key'] || '');
  if (!given) return false;
  if (process.env.CRON_SECRET && given === process.env.CRON_SECRET) return true;
  const { data } = await admin.from('private_settings').select('value').eq('key', 'cron_key').maybeSingle();
  const want = data?.value || '';
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return want.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (!hasAdmin) return res.status(503).json({ error: 'Server key missing' });
  if (!(await authorized(req))) return res.status(401).json({ error: 'Nope' });

  const started = Date.now();
  const { data: subs } = await admin.from('push_subscriptions').select('*');
  if (!subs?.length) return res.status(200).json({ ok: true, subs: 0 });
  const byUser = {};
  for (const s of subs) (byUser[s.user_id] ||= []).push(s);

  const since = new Date(Date.now() - 4 * 86400000).toISOString();
  const { data: parlays, error } = await admin
    .from('parlays')
    .select('*')
    .in('user_id', Object.keys(byUser))
    .or('status.is.null,status.not.in.(won,lost)')
    .gte('created_at', since)
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  if (!parlays.length) return res.status(200).json({ ok: true, parlays: 0 });

  // Fetch each game once
  const cache = {};
  const keyOf = (leg) => `${leg.league}:${leg.gameId}`;
  const games = [...new Set(parlays.flatMap((p) => (p.legs || []).map(keyOf)))];
  await Promise.all(
    games.map(async (k) => {
      const [league, gameId] = k.split(':');
      try {
        const r = await fetch(summaryUrl(league, gameId), { signal: AbortSignal.timeout(6000) });
        cache[k] = r.ok ? normalizeSummary(await r.json(), gameId) : null;
      } catch {
        cache[k] = null;
      }
    })
  );

  const { data: states } = await admin.from('push_state').select('*').in('parlay_id', parlays.map((p) => p.id));
  const stateOf = Object.fromEntries((states || []).map((s) => [s.parlay_id, new Set(s.sent || [])]));

  let sent = 0;
  const dead = new Set();
  const upserts = [];
  const sends = [];

  for (const p of parlays) {
    const { keys, rows, overall } = slipKeys(p, (leg) => cache[keyOf(leg)]);
    // Don't judge a slip when we couldn't load its games this time
    if ((p.legs || []).some((leg) => cache[keyOf(leg)] === null)) continue;

    const before = stateOf[p.id];
    if (!before) {
      // First time we see this slip: remember where it stands, don't blast old news.
      upserts.push({ parlay_id: p.id, sent: [...keys], updated_at: new Date().toISOString() });
    } else {
      const fresh = new Set([...keys].filter((k) => !before.has(k)));
      if (fresh.size) {
        const alerts = chooseAlerts(p, rows, fresh, before);
        for (const a of alerts) {
          for (const sub of byUser[p.user_id] || []) {
            sends.push(
              sendPush(sub, { title: a.title, body: a.body, url: `/#slip/${p.id}`, tag: `${p.id}:${a.key}` }).then((r) => {
                if (r.ok) sent++;
                if (r.gone) dead.add(sub.endpoint);
              })
            );
          }
        }
        upserts.push({ parlay_id: p.id, sent: [...new Set([...before, ...keys])], updated_at: new Date().toISOString() });
      }
    }

    // Settle decided slips so stats update even if the app is closed
    if (overall === 'won' || overall === 'lost') {
      const payout = overall === 'won' ? payoutFor(p.stake, p.odds) : 0;
      await admin.from('parlays').update({ status: overall, payout, settled_at: new Date().toISOString() }).eq('id', p.id);
    }
  }

  await Promise.all(sends);
  if (upserts.length) await admin.from('push_state').upsert(upserts);
  if (dead.size) await admin.from('push_subscriptions').delete().in('endpoint', [...dead]);

  return res.status(200).json({ ok: true, parlays: parlays.length, games: games.length, sent, ms: Date.now() - started });
}
