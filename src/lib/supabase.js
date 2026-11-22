import { createClient } from '@supabase/supabase-js';

// Keep only https://xxxx.supabase.co even if extra path (e.g. /rest/v1/) was pasted in.
const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const url = rawUrl ? new URL(rawUrl).origin : rawUrl;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabase = createClient(url, key);
