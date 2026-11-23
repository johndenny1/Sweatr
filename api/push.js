// /api/push
//   GET                          → { publicKey }   (VAPID key for subscribing)
//   POST { action: 'subscribe', subscription }     save this device
//   POST { action: 'unsubscribe', endpoint }       remove this device
//   POST { action: 'test' }                        send a test alert to your devices
import { requireUser } from './_auth.js';
import { admin, hasAdmin } from './_admin.js';
import { vapidKeys, sendPush } from './_push.js';
import { makeAlert } from '../src/lib/alertCopy.js';

export default async function handler(req, res) {
  if (!hasAdmin) return res.status(503).json({ error: 'Server key missing' });
  if (req.method === 'GET') return res.status(200).json({ publicKey: vapidKeys()?.publicKey });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const user = await requireUser(req, res);
  if (!user) return;
  const { action, subscription, endpoint } = req.body || {};

  if (action === 'subscribe') {
    const s = subscription || {};
    if (!s.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth)
      return res.status(400).json({ error: 'Bad subscription' });
    const { error } = await admin.from('push_subscriptions').upsert(
      { endpoint: s.endpoint, user_id: user.id, p256dh: s.keys.p256dh, auth: s.keys.auth, created_at: new Date().toISOString() },
      { onConflict: 'endpoint' }
    );
    if (error) return res.status(500).json({ error: /push_subscriptions/.test(error.message) ? 'Run supabase/push.sql first' : error.message });
    return res.status(200).json({ ok: true });
  }

  if (action === 'unsubscribe') {
    await admin.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', String(endpoint || ''));
    return res.status(200).json({ ok: true });
  }

  if (action === 'test') {
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', user.id);
    if (!subs?.length) return res.status(400).json({ error: 'Turn alerts on first' });
    const msg = makeAlert('test', {});
    const results = await Promise.all(subs.map((s) => sendPush(s, { ...msg, url: '/', tag: 'test' })));
    const gone = subs.filter((_, i) => results[i].gone).map((s) => s.endpoint);
    if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);
    const ok = results.filter((r) => r.ok).length;
    if (!ok) return res.status(502).json({ error: results.find((r) => r.error)?.error || 'Could not deliver' });
    return res.status(200).json({ ok: true, sent: ok });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
