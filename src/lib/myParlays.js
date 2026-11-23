// Your own slips only. (Since Rooms, the database also lets you read slips friends shared with you,
// so every "my stuff" screen has to filter by owner.)
import { supabase } from './supabase.js';

export async function loadMyParlays(userId) {
  const { data, error } = await supabase
    .from('parlays')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}
