// Server-only Supabase client with the secret (service role) key. It can write the
// protected fields (verified, status, payout) that users can't touch themselves.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();

export const hasAdmin = Boolean(rawUrl && secret);

export const admin = hasAdmin
  ? createClient(new URL(rawUrl).origin, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// Sign / verify small payloads (the scan receipt) so the browser can't forge them.
const signingKey = () => crypto.createHash('sha256').update(`sweatr-scan:${secret}`).digest();

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verify(token) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
