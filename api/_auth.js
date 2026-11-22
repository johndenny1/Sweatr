import { createClient } from '@supabase/supabase-js';

const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const supabase = createClient(
  rawUrl ? new URL(rawUrl).origin : rawUrl,
  (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
);

// Returns the signed-in user, or sends a 401 and returns null.
export async function requireUser(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Session expired, sign in again' });
    return null;
  }
  return data.user;
}
