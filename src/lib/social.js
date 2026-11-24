// Profiles (@handles), friends and rankings.
import { supabase } from './supabase.js';
import { displayName } from './profile.jsx';

const msg = (error) => {
  const m = error?.message || String(error || 'Something went wrong');
  if (/profiles|friendships|league_standings|friend_standings|add_friend/i.test(m) && /does not exist|not find|schema cache/i.test(m))
    return 'Leagues aren’t set up yet — run supabase/leagues.sql in Supabase.';
  if (/duplicate key|profiles_handle_key/i.test(m)) return 'That handle is taken';
  if (/profiles_handle_check|check constraint/i.test(m)) return 'Handles are 3–20 letters, numbers or _';
  return m;
};

// Keep the public profile's name/photo in step with the account (handle untouched)
export async function syncProfile(user) {
  if (!user) return;
  await supabase
    .from('profiles')
    .upsert({ user_id: user.id, display_name: displayName(user), avatar_url: user.user_metadata?.avatar_url || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(() => {}, () => {});
}

export async function myProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(msg(error));
  return data;
}

export async function claimHandle(user, handle) {
  const h = String(handle || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new Error('Handles are 3–20 letters, numbers or _');
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, handle: h, display_name: displayName(user), avatar_url: user.user_metadata?.avatar_url || null }, { onConflict: 'user_id' });
  if (error) throw new Error(msg(error));
  return h;
}

export const suggestHandle = (user) =>
  displayName(user).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20).padEnd(3, '_');

export async function addFriend(handle) {
  const { data, error } = await supabase.rpc('add_friend', { p_handle: handle });
  if (error) throw new Error(msg(error));
  return data; // sent | accepted | already
}

export async function acceptFriend(fromId) {
  const { error } = await supabase.rpc('accept_friend', { p_from: fromId });
  if (error) throw new Error(msg(error));
}

export async function removeFriend(userId, otherId) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester.eq.${userId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${userId})`);
  if (error) throw new Error(msg(error));
}

// { incoming: [profile…], outgoing: [profile…] }
export async function friendRequests(userId) {
  const { data, error } = await supabase.from('friendships').select('*').eq('status', 'pending');
  if (error) throw new Error(msg(error));
  const ids = [...new Set((data || []).map((f) => (f.requester === userId ? f.addressee : f.requester)))];
  const { data: profs } = ids.length ? await supabase.from('profiles').select('*').in('user_id', ids) : { data: [] };
  const p = (id) => (profs || []).find((x) => x.user_id === id) || { user_id: id };
  return {
    incoming: (data || []).filter((f) => f.addressee === userId).map((f) => p(f.requester)),
    outgoing: (data || []).filter((f) => f.requester === userId).map((f) => p(f.addressee)),
  };
}

export async function leagueStandings(roomId, period) {
  const { data, error } = await supabase.rpc('league_standings', { p_room: roomId, p_period: period });
  if (error) throw new Error(msg(error));
  return data || [];
}

export async function friendStandings(period) {
  const { data, error } = await supabase.rpc('friend_standings', { p_period: period });
  if (error) throw new Error(msg(error));
  return data || [];
}

// Minimum verified slips to be ranked, so one lucky hit can't top the board
export const MIN_SLIPS = { week: 3, month: 5, all: 5 };

export function rankRows(rows, period) {
  const min = MIN_SLIPS[period] ?? 3;
  const withStats = rows.map((r) => {
    const staked = Number(r.staked) || 0;
    const profit = Math.round((Number(r.profit) || 0) * 100) / 100;
    const settled = r.wins + r.losses;
    const recent = (r.recent || []).filter(Boolean);
    let streak = { type: null, count: 0 };
    for (const s of recent) {
      if (!streak.type) streak = { type: s, count: 1 };
      else if (s === streak.type) streak.count++;
      else break;
    }
    return {
      ...r,
      staked,
      profit,
      biggest: Number(r.biggest) || 0,
      roi: staked > 0 ? profit / staked : null,
      hitRate: settled ? r.wins / settled : null,
      recent,
      streak,
    };
  });
  const byRoi = (a, b) => (b.roi ?? -9) - (a.roi ?? -9) || b.profit - a.profit || b.slips - a.slips;
  const ranked = withStats.filter((r) => r.slips >= min).sort(byRoi).map((r, i) => ({ ...r, rank: i + 1 }));
  const unranked = withStats.filter((r) => r.slips < min).sort((a, b) => b.slips - a.slips);
  return { ranked, unranked, min };
}

export const pct = (x) => (x == null ? '–' : `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`);
