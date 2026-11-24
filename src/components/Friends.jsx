import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Standings, { Face } from './Standings.jsx';
import {
  myProfile,
  claimHandle,
  suggestHandle,
  addFriend,
  acceptFriend,
  removeFriend,
  friendRequests,
  friendStandings,
  rankRows,
  pct,
} from '../lib/social.js';
import { fmtMoney } from '../lib/money.js';

export default function Friends({ user }) {
  const [profile, setProfile] = useState(undefined);
  const [handle, setHandle] = useState('');
  const [add, setAdd] = useState('');
  const [reqs, setReqs] = useState({ incoming: [], outgoing: [] });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [boardKey, setBoardKey] = useState(0);
  const [vs, setVs] = useState(null);
  const [mine, setMine] = useState({}); // period → my row (for head-to-head)

  const reload = () => {
    friendRequests(user.id).then(setReqs).catch(() => {});
    setBoardKey((k) => k + 1);
  };

  useEffect(() => {
    myProfile(user.id)
      .then((p) => {
        setProfile(p || null);
        if (!p?.handle) setHandle(suggestHandle(user));
      })
      .catch((e) => {
        setProfile(null);
        setError(e.message);
      });
    friendRequests(user.id).then(setReqs).catch(() => {});
  }, [user]);

  async function saveHandle(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const h = await claimHandle(user, handle);
      setProfile((p) => ({ ...(p || {}), handle: h }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e) {
    e.preventDefault();
    if (!add.trim()) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await addFriend(add);
      setNote(r === 'accepted' ? 'You’re friends now 🤝' : r === 'already' ? 'Request already sent' : 'Request sent');
      setAdd('');
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = `Add me on Sweatr: @${profile.handle}`;
    try {
      if (navigator.share) await navigator.share({ text, url: window.location.origin });
      else {
        await navigator.clipboard.writeText(text);
        setNote('Copied!');
      }
    } catch {}
  }

  if (profile === undefined) return <p className="muted center small">Loading…</p>;

  if (!profile?.handle) {
    return (
      <form className="card stack handle-card" onSubmit={saveHandle}>
        <div className="label">Pick your handle</div>
        <p className="muted small">Friends find you by it. You can change it later.</p>
        <div className="handle-input">
          <span>@</span>
          <input value={handle} maxLength={20} autoCapitalize="none" autoCorrect="off" onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
        </div>
        <button className="primary big" disabled={busy || handle.length < 3}>
          {busy ? 'Saving…' : 'Claim it'}
        </button>
        {error && <p className="error small">{error}</p>}
      </form>
    );
  }

  return (
    <div className="stack friends">
      <div className="me-handle">
        <span>
          You’re <b>@{profile.handle}</b>
        </span>
        <button className="flex-mini" onClick={share}>
          Share
        </button>
      </div>

      <form className="add-friend" onSubmit={onAdd}>
        <input value={add} placeholder="Add a friend by @handle" autoCapitalize="none" autoCorrect="off" onChange={(e) => setAdd(e.target.value)} />
        <button className="send" disabled={busy || !add.trim()} aria-label="Add friend">
          +
        </button>
      </form>
      {note && <div className="scan-note">{note}</div>}
      {error && <p className="error small">{error}</p>}

      {reqs.incoming.length > 0 && (
        <div className="card stack">
          <div className="label">Friend requests</div>
          {reqs.incoming.map((p) => (
            <div key={p.user_id} className="req-row">
              <Face name={p.display_name} src={p.avatar_url} size={34} />
              <span className="grow">
                <b>{p.display_name || 'Someone'}</b> {p.handle && <span className="muted small">@{p.handle}</span>}
              </span>
              <button className="flex-mini" onClick={() => acceptFriend(p.user_id).then(reload)}>
                Accept
              </button>
              <button className="x-btn" aria-label="Decline" onClick={() => removeFriend(user.id, p.user_id).then(reload)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {reqs.outgoing.length > 0 && (
        <div className="muted small">Waiting on: {reqs.outgoing.map((p) => (p.handle ? `@${p.handle}` : p.display_name)).join(', ')}</div>
      )}

      <div className="section-title">Friends leaderboard</div>
      <Standings
        key={boardKey}
        meId={user.id}
        emptyText="Add friends to start a leaderboard. Rankings show up once people have a few verified slips."
        load={async (period) => {
          const rows = await friendStandings(period);
          const me = rankRows(rows, period);
          setMine((m) => ({ ...m, [period]: [...me.ranked, ...me.unranked].find((r) => r.user_id === user.id), _period: period }));
          return rows;
        }}
        onPick={(r) => r.user_id !== user.id && setVs(r)}
      />

      {vs && (
        <HeadToHead
          me={mine[mine._period]}
          them={vs}
          period={mine._period}
          onClose={() => setVs(null)}
          onRemove={async () => {
            await removeFriend(user.id, vs.user_id);
            setVs(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

const PERIOD_TEXT = { week: 'This week', month: 'This month', all: 'All time' };

function HeadToHead({ me, them, period, onClose, onRemove }) {
  const rows = me
    ? [
        ['Record', `${me.wins}-${me.losses}`, `${them.wins}-${them.losses}`, me.wins - me.losses, them.wins - them.losses],
        ['ROI', pct(me.roi), pct(them.roi), me.roi ?? -9, them.roi ?? -9],
        ['Profit', fmtMoney(me.profit, { sign: true }), fmtMoney(them.profit, { sign: true }), me.profit, them.profit],
        ['Hit rate', pct(me.hitRate).replace('+', ''), pct(them.hitRate).replace('+', ''), me.hitRate ?? -1, them.hitRate ?? -1],
        ['Biggest hit', me.biggest ? fmtMoney(me.biggest, { sign: true }) : '–', them.biggest ? fmtMoney(them.biggest, { sign: true }) : '–', me.biggest, them.biggest],
        ['Slips', String(me.slips), String(them.slips), null, null],
      ]
    : [];
  const myWins = rows.filter((r) => r[3] != null && r[3] > r[4]).length;
  const theirWins = rows.filter((r) => r[3] != null && r[4] > r[3]).length;

  return createPortal(
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker h2h" onClick={(e) => e.stopPropagation()}>
        <div className="picker-grab" />
        <div className="h2h-head">
          <div>
            <div className="recap-kicker">{PERIOD_TEXT[period] || ''} · head to head</div>
            <h2>
              You vs {them.display_name || 'them'}
            </h2>
          </div>
          <span className={`stamp ${myWins > theirWins ? 'stamp-won' : myWins < theirWins ? 'stamp-lost' : 'stamp-pending'}`}>
            {myWins > theirWins ? 'You lead' : myWins < theirWins ? 'They lead' : 'Dead even'}
          </span>
        </div>
        <div className="h2h-faces">
          <div>
            <Face name={me?.display_name} src={me?.avatar_url} size={52} />
            <b>You</b>
          </div>
          <span className="h2h-score">
            {myWins}–{theirWins}
          </span>
          <div>
            <Face name={them.display_name} src={them.avatar_url} size={52} />
            <b>{them.display_name}</b>
          </div>
        </div>
        <div className="h2h-table">
          {rows.map(([label, a, b, x, y]) => (
            <div key={label} className="h2h-row">
              <span className={x != null && x > y ? 'win' : ''}>{a}</span>
              <span className="h2h-label">{label}</span>
              <span className={y != null && y > x ? 'win' : ''}>{b}</span>
            </div>
          ))}
        </div>
        <button className="link danger small center" onClick={onRemove}>
          Remove friend
        </button>
      </div>
    </div>,
    document.body
  );
}
