// POST /api/delete-account — permanently deletes the signed-in user's account,
// their slips (removed with the account) and their profile photos.
import { requireUser } from './_auth.js';
import { admin, hasAdmin } from './_admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!hasAdmin) return res.status(503).json({ error: 'Account deletion needs SUPABASE_SERVICE_ROLE_KEY in Vercel' });

    // Profile photos
    const { data: files } = await admin.storage.from('avatars').list(user.id).catch(() => ({ data: [] }));
    if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`));

    // Slips (also removed by the account's cascade, but delete explicitly to be sure)
    await admin.from('parlays').delete().eq('user_id', user.id);

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
