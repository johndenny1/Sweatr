import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase.js';
import {
  getRoom,
  getMembers,
  getRoomSlips,
  getMessages,
  sendMessage,
  shareSlip,
  unshareSlip,
  leaveRoom,
  deleteRoom,
  inviteLink,
  subscribeRoom,
} from '../lib/rooms.js';
import { useLiveSlips, useLegMoments } from '../lib/live.js';
import { describeLeg } from '../lib/evaluate.js';
import { toWin, fmtMoney } from '../lib/money.js';
import { initials } from '../lib/profile.jsx';
import Standings from './Standings.jsx';
import { leagueStandings } from '../lib/social.js';
import { fmtSubmitted } from '../lib/when.js';

const STAMP = { won: 'Cashed', lost: 'Busted', live: 'Live', pending: 'Open', push: 'Push' };
const LEG_TEXT = { pending: 'Soon', live: 'Live', won: 'Hit', lost: 'Miss', push: 'Push' };
const REACTIONS = ['🔥', '😭', '💀', '🙏', '💰'];

function Face({ name, src, size = 34, online }) {
  return (
    <div className={`face ${online ? 'online' : ''}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </div>
  );
}

function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function RoomView({ user, id, onBack, onOpenSlip }) {
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [slips, setSlips] = useState([]);
  const [messages, setMessages] = useState([]);
  const [moments, setMoments] = useState([]);
  const [online, setOnline] = useState([]);
  const [tab, setTab] = useState('standings');
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const loadSlips = useCallback(() => getRoomSlips(id).then(setSlips).catch((e) => setError(e.message)), [id]);
  const loadMembers = useCallback(() => getMembers(id).then(setMembers).catch(() => {}), [id]);

  useEffect(() => {
    getRoom(id)
      .then(setRoom)
      .catch((e) => setError(e.message));
    loadMembers();
    loadSlips();
    getMessages(id).then(setMessages).catch(() => {});
    return subscribeRoom(id, user, {
      onMessage: (m) => {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(-199), m]));
        if (tabRef.current !== 'chat' && m.user_id !== user.id) setUnread((n) => n + 1);
      },
      onSlips: loadSlips,
      onMembers: loadMembers,
      onPresence: setOnline,
    });
  }, [id, user, loadSlips, loadMembers]);

  const { results, updated } = useLiveSlips(slips);
  const nameOf = useCallback(
    (uid) => (uid === user.id ? 'You' : members.find((m) => m.user_id === uid)?.display_name || 'Someone'),
    [members, user.id]
  );

  useLegMoments(slips, results, (m) => {
    const who = nameOf(m.parlay.user_id);
    const text = m.overall
      ? m.overall === 'won'
        ? `${who === 'You' ? 'You' : who} cashed “${m.parlay.name}”${toWin(m.parlay.stake, m.parlay.odds) != null ? ` for +${fmtMoney(toWin(m.parlay.stake, m.parlay.odds))}` : ''}`
        : `“${m.parlay.name}” is busted`
      : `${describeLeg(m.leg)} ${m.result.status === 'won' ? 'hit' : 'missed'}`;
    const tone = m.overall || m.result.status;
    setMoments((prev) => [...prev, { id: `m${Date.now()}${Math.random()}`, moment: true, tone, text, owner: who, created_at: new Date().toISOString() }]);
    if (tabRef.current !== 'chat') setUnread((n) => n + 1);
  });

  const feed = useMemo(
    () => [...messages, ...moments].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages, moments]
  );

  // Chat scroll to bottom
  const feedEnd = useRef(null);
  useEffect(() => {
    if (tab === 'chat') feedEnd.current?.scrollIntoView({ block: 'end' });
  }, [tab, feed.length]);

  const [draft, setDraft] = useState('');
  async function send(text) {
    const body = (text ?? draft).trim();
    if (!body) return;
    if (text == null) setDraft('');
    try {
      await sendMessage(user, id, body);
    } catch (e) {
      setError(e.message);
    }
  }

  async function invite() {
    const url = inviteLink(room.code);
    const text = `Join “${room.name}” on Sweatr. Verified slips only, let’s see who’s actually up.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my Sweatr league', text, url });
        return;
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copy this invite link', url);
    }
  }

  async function leave() {
    const isOwner = room?.owner_id === user.id;
    if (!window.confirm(isOwner ? 'Delete this league for everyone?' : 'Leave this league?')) return;
    try {
      if (isOwner) await deleteRoom(id);
      else await leaveRoom(user.id, id);
      onBack();
    } catch (e) {
      setError(e.message);
    }
  }

  const live = slips.filter((p) => results[p.id]?.overall === 'live').length;
  const totalOnTheLine = slips.reduce((s, p) => {
    const st = results[p.id]?.overall;
    return st === 'live' || st === 'pending' ? s + (toWin(p.stake, p.odds) || 0) : s;
  }, 0);

  if (!room) return <p className="muted">{error || 'Loading league…'}</p>;

  return (
    <div className="stack room">
      <div className="row between">
        <button className="back-btn" onClick={onBack}>
          <svg className="back-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          <span>Leagues</span>
        </button>
        <button className="room-more" onClick={() => setMenu((v) => !v)} aria-label="League options">
          •••
        </button>
      </div>
      {menu && (
        <div className="card room-menu">
          <div className="muted small">
            Invite code <b className="room-code">{room.code}</b>
          </div>
          <button className="link danger" onClick={leave}>
            {room.owner_id === user.id ? 'Delete room' : 'Leave room'}
          </button>
        </div>
      )}

      <div className="room-hero">
        <h1 className="room-name">{room.name}</h1>
        <div className="room-meta">
          <div className="faces">
            {members.slice(0, 6).map((m) => (
              <Face key={m.user_id} name={m.display_name} src={m.avatar_url} size={30} online={online.includes(m.user_id)} />
            ))}
          </div>
          <span className="muted small">
            <span className="here-dot" /> {Math.max(online.length, 1)} here · {members.length} in league
          </span>
        </div>
        <div className="room-stats">
          <div>
            <b>{slips.length}</b>
            <span>Slips</span>
          </div>
          <div>
            <b className={live ? 'live-num' : ''}>{live}</b>
            <span>Live</span>
          </div>
          <div>
            <b>{fmtMoney(totalOnTheLine) || '$0'}</b>
            <span>On the line</span>
          </div>
        </div>
        <button className="invite-btn" onClick={invite}>
          {copied ? 'Link copied ✓' : 'Invite the group'}
        </button>
      </div>

      <div className="room-tabs three">
        <button className={tab === 'standings' ? 'on' : ''} onClick={() => setTab('standings')}>
          Standings
        </button>
        <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>
          Live
        </button>
        <button
          className={tab === 'chat' ? 'on' : ''}
          onClick={() => {
            setTab('chat');
            setUnread(0);
          }}
        >
          Chat {unread > 0 && <span className="unread">{unread}</span>}
        </button>
      </div>

      {tab === 'standings' && (
        <Standings
          meId={user.id}
          load={(period) => leagueStandings(id, period)}
          emptyText="Nobody's ranked yet. Rankings fill in as people's verified slips settle."
        />
      )}

      {tab === 'board' && (
        <>
          <button className="add-slip" onClick={() => setPicker(true)}>
            <span>＋</span> Drop a slip in the league
          </button>
          {slips.length === 0 && <div className="card muted center">No slips yet. Drop yours first.</div>}
          {slips.map((p) => (
            <BoardSlip
              key={p.id}
              parlay={p}
              live={results[p.id]}
              owner={members.find((m) => m.user_id === p.user_id)}
              mine={p.user_id === user.id}
              onOpen={() => onOpenSlip(p.id)}
              onRemove={async () => {
                await unshareSlip(id, p.id).catch((e) => setError(e.message));
                loadSlips();
              }}
            />
          ))}
          {updated && slips.length > 0 && (
            <p className="muted small center">Live · updated {updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
          )}
        </>
      )}

      {tab === 'chat' && (
        <div className="chat">
          {feed.length === 0 && <div className="muted center small chat-empty">Talk your talk. Leg hits and misses show up here live.</div>}
          {feed.map((m) =>
            m.moment ? (
              <div key={m.id} className={`moment moment-${m.tone}`}>
                <span className="moment-icon">{m.tone === 'won' ? '✅' : m.tone === 'lost' ? '❌' : '•'}</span>
                <span>
                  {m.text}
                  <span className="moment-owner"> · {m.owner === 'You' ? 'your slip' : `${m.owner}’s slip`}</span>
                </span>
              </div>
            ) : (
              <div key={m.id} className={`msg ${m.user_id === user.id ? 'mine' : ''}`}>
                {m.user_id !== user.id && <Face name={m.display_name} src={m.avatar_url} size={30} />}
                <div className="msg-body">
                  {m.user_id !== user.id && <div className="msg-name">{m.display_name || 'Someone'}</div>}
                  <div className={`bubble ${/^\p{Extended_Pictographic}+$/u.test(m.body) ? 'emoji-only' : ''}`}>{m.body}</div>
                  <div className="msg-time">{timeAgo(m.created_at)}</div>
                </div>
              </div>
            )
          )}
          <div ref={feedEnd} />
          <div className="composer">
            <div className="reactions">
              {REACTIONS.map((r) => (
                <button key={r} onClick={() => send(r)} aria-label={`Send ${r}`}>
                  {r}
                </button>
              ))}
            </div>
            <form
              className="composer-row"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} placeholder="Say something…" />
              <button className="send" disabled={!draft.trim()} aria-label="Send">
                ↑
              </button>
            </form>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {picker && (
        <SlipPicker
          userId={user.id}
          already={new Set(slips.map((s) => s.id))}
          onClose={() => setPicker(false)}
          onPick={async (pid) => {
            setPicker(false);
            try {
              await shareSlip(id, pid);
              loadSlips();
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      )}
    </div>
  );
}

function BoardSlip({ parlay, live, owner, mine, onOpen, onRemove }) {
  const status = live?.overall || 'pending';
  const rows = live?.rows || [];
  const hits = rows.filter((r) => r.result.status === 'won').length;
  const win = toWin(parlay.stake, parlay.odds);
  return (
    <div className={`board-slip ticket-${status}`}>
      <button className="board-head" onClick={onOpen}>
        <Face name={owner?.display_name} src={owner?.avatar_url} size={38} />
        <div className="board-title">
          <div className="board-owner">
            {mine ? 'You' : owner?.display_name || 'Someone'}
            {parlay.verified && <span className="vbadge on sm">✓</span>}
          </div>
          <div className="muted small">
            {parlay.name} · {fmtSubmitted(parlay.created_at)} · {hits}/{rows.length} hit{parlay.odds ? ` · ${parlay.odds}` : ''}
            {win != null ? ` · to win ${fmtMoney(win)}` : ''}
          </div>
        </div>
        <span className={`stamp stamp-${status}`}>
          {status === 'live' && <span className="dot" />}
          {STAMP[status]}
        </span>
      </button>
      <div className="board-legs">
        {rows.map(({ leg, result }, i) => (
          <div key={leg.id || i} className={`board-leg status-${result.status}`}>
            <div className="row between">
              <span className="board-leg-name">{describeLeg(leg)}</span>
              <span className={`pill status-${result.status}`}>{LEG_TEXT[result.status]}</span>
            </div>
            {result.progress !== undefined && (
              <div className="bar">
                <div style={{ width: `${Math.round(Math.min(1, result.progress) * 100)}%` }} />
              </div>
            )}
            {result.summary && <div className="muted small">{result.summary}</div>}
          </div>
        ))}
      </div>
      {mine && (
        <button className="link muted small board-remove" onClick={onRemove}>
          Take out of league
        </button>
      )}
    </div>
  );
}

function SlipPicker({ userId, already, onClose, onPick }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    supabase
      .from('parlays')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setList(data || []));
  }, [userId]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-grab" />
        <div className="row between">
          <h2>Pick a slip</h2>
          <button className="recap-x small-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="picker-list">
          {list === null && <p className="muted">Loading…</p>}
          {list?.length === 0 && <p className="muted">You don’t have any slips yet. Scan one first.</p>}
          {list?.map((p) => {
            const inRoom = already.has(p.id);
            const done = p.status === 'won' || p.status === 'lost';
            return (
              <button key={p.id} className="picker-item" disabled={inRoom} onClick={() => onPick(p.id)}>
                <div>
                  <div className="picker-name">
                    {p.name}
                    {p.verified && <span className="vbadge on sm">✓</span>}
                  </div>
                  <div className="muted small">
                    {(p.legs || []).length} legs{p.odds ? ` · ${p.odds}` : ''}
                    {done ? ` · ${p.status === 'won' ? 'Cashed' : 'Busted'}` : ''}
                  </div>
                </div>
                <span className="picker-cta">{inRoom ? 'Added' : 'Add'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
