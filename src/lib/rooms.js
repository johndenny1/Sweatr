// Sweat Rooms data layer: create/join rooms, share slips, chat. Live updates via Supabase Realtime.
import { supabase } from './supabase.js';
import { displayName } from './profile.jsx';

const me = (user) => ({ p_display: displayName(user), p_avatar: user?.user_metadata?.avatar_url || null });

function clean(error) {
  const msg = error?.message || String(error || 'Something went wrong');
  if (/function .*create_room|function .*join_room|relation .*rooms/i.test(msg))
    return 'Rooms aren’t set up yet — run supabase/rooms.sql in Supabase.';
  return msg;
}

export async function createRoom(user, name) {
  const { data, error } = await supabase.rpc('create_room', { p_name: name, ...me(user) });
  if (error) throw new Error(clean(error));
  return data;
}

export async function joinRoom(user, code) {
  const { data, error } = await supabase.rpc('join_room', { p_code: code, ...me(user) });
  if (error) throw new Error(clean(error));
  return data;
}

export async function myRooms(userId) {
  const { data, error } = await supabase
    .from('room_members')
    .select('joined_at, rooms(id, code, name, owner_id, created_at, room_members(count), room_slips(count))')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });
  if (error) throw new Error(clean(error));
  return (data || [])
    .filter((r) => r.rooms)
    .map((r) => ({
      ...r.rooms,
      members: r.rooms.room_members?.[0]?.count ?? 1,
      slips: r.rooms.room_slips?.[0]?.count ?? 0,
    }));
}

export async function getRoom(id) {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', id).single();
  if (error) throw new Error(clean(error));
  return data;
}

export async function getMembers(roomId) {
  const { data, error } = await supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at');
  if (error) throw new Error(clean(error));
  return data || [];
}

export async function getRoomSlips(roomId) {
  const { data, error } = await supabase
    .from('room_slips')
    .select('created_at, user_id, parlays(*)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(clean(error));
  return (data || []).filter((r) => r.parlays).map((r) => ({ ...r.parlays, shared_at: r.created_at }));
}

export async function shareSlip(roomId, parlayId) {
  const { error } = await supabase.from('room_slips').insert({ room_id: roomId, parlay_id: parlayId });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(clean(error));
}

export async function unshareSlip(roomId, parlayId) {
  const { error } = await supabase.from('room_slips').delete().eq('room_id', roomId).eq('parlay_id', parlayId);
  if (error) throw new Error(clean(error));
}

export async function getMessages(roomId) {
  const { data, error } = await supabase
    .from('room_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('id', { ascending: false })
    .limit(100);
  if (error) throw new Error(clean(error));
  return (data || []).reverse();
}

export async function sendMessage(user, roomId, body) {
  const text = String(body || '').trim().slice(0, 500);
  if (!text) return;
  const { error } = await supabase
    .from('room_messages')
    .insert({ room_id: roomId, body: text, display_name: displayName(user), avatar_url: user?.user_metadata?.avatar_url || null });
  if (error) throw new Error(clean(error));
}

export async function leaveRoom(userId, roomId) {
  const { error } = await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', userId);
  if (error) throw new Error(clean(error));
}

export async function deleteRoom(roomId) {
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw new Error(clean(error));
}

export const inviteLink = (code) => `${window.location.origin}/#join/${code}`;

// Subscribe to everything happening in a room. Returns an unsubscribe function.
export function subscribeRoom(roomId, user, { onMessage, onSlips, onMembers, onPresence }) {
  const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: user.id } } });
  channel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` }, (p) =>
      onMessage?.(p.new)
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_slips' }, () => onSlips?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, () => onMembers?.())
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      onPresence?.(Object.keys(state));
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ at: Date.now() });
    });
  return () => supabase.removeChannel(channel);
}

// Remember an invite code from a #join/CODE link until the user is signed in.
const PENDING = 'sweatr-pending-room';
export function capturePendingJoin() {
  const m = window.location.hash.match(/^#join\/([A-Za-z0-9]{4,10})$/);
  if (m) {
    try { localStorage.setItem(PENDING, m[1].toUpperCase()); } catch {}
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
export function takePendingJoin() {
  try {
    const c = localStorage.getItem(PENDING);
    if (c) localStorage.removeItem(PENDING);
    return c;
  } catch {
    return null;
  }
}
