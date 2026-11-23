// GET /api/health — shows which server settings are present (never the values).
import { hasAdmin } from './_admin.js';

export default function handler(req, res) {
  const has = (k) => Boolean((process.env[k] || '').trim());
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabase_url: has('VITE_SUPABASE_URL') || has('SUPABASE_URL'),
    supabase_public_key: has('VITE_SUPABASE_ANON_KEY') || has('SUPABASE_ANON_KEY'),
    supabase_secret_key: has('SUPABASE_SERVICE_ROLE_KEY') || has('SUPABASE_SECRET_KEY'),
    verification_ready: hasAdmin,
    gemini_key: has('GEMINI_API_KEY'),
  });
}
