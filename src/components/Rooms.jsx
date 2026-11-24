import { useEffect, useState } from 'react';
import { createRoom, joinRoom, myRooms } from '../lib/rooms.js';
import Friends from './Friends.jsx';

// Leagues tab: your leagues (rankings + live board + chat) and your friends.
export default function Rooms({ user, onOpen }) {
  const [tab, setTab] = useState(() => sessionStorage.getItem('sweatr-social-tab') || 'leagues');
  const pick = (t) => {
    setTab(t);
    try {
      sessionStorage.setItem('sweatr-social-tab', t);
    } catch {}
  };
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    myRooms(user.id)
      .then(setRooms)
      .catch((e) => {
        setRooms([]);
        setError(e.message);
      });
  }, [user.id]);

  async function submit(e) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const room = mode === 'create' ? await createRoom(user, value) : await joinRoom(user, value);
      onOpen(room.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function open(m) {
    setMode(m);
    setValue('');
    setError('');
  }

  return (
    <div className="stack rooms">
      <div className="rooms-hero">
        <div className="rooms-kicker">Compete with the group chat</div>
        <h1>{tab === 'friends' ? 'Friends' : 'Leagues'}</h1>
        <p className="muted">
          {tab === 'friends'
            ? 'Add friends by @handle, see who’s actually up, and go head to head.'
            : 'Rank up against your crew on verified slips, and sweat each other’s legs live.'}
        </p>
      </div>

      <div className="room-tabs social-tabs">
        <button className={tab === 'leagues' ? 'on' : ''} onClick={() => pick('leagues')}>
          Leagues
        </button>
        <button className={tab === 'friends' ? 'on' : ''} onClick={() => pick('friends')}>
          Friends
        </button>
      </div>

      {tab === 'friends' ? (
        <Friends user={user} />
      ) : (
      <>

      <div className="rooms-actions">
        <button className={`rooms-action ${mode === 'create' ? 'on' : ''}`} onClick={() => open('create')}>
          <span className="rooms-action-icon">＋</span>
          <span>Start a league</span>
        </button>
        <button className={`rooms-action ${mode === 'join' ? 'on' : ''}`} onClick={() => open('join')}>
          <span className="rooms-action-icon">#</span>
          <span>Join with code</span>
        </button>
      </div>

      {mode && (
        <form className="card rooms-form" onSubmit={submit}>
          <label className="label">{mode === 'create' ? 'League name' : 'Invite code'}</label>
          <input
            autoFocus
            value={value}
            maxLength={mode === 'create' ? 40 : 8}
            placeholder={mode === 'create' ? 'Sunday crew' : 'ABC123'}
            className={mode === 'join' ? 'code-input' : ''}
            autoCapitalize={mode === 'join' ? 'characters' : 'words'}
            autoCorrect="off"
            onChange={(e) => setValue(mode === 'join' ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : e.target.value)}
          />
          <button className="primary big" disabled={busy || !value.trim()}>
            {busy ? 'One sec…' : mode === 'create' ? 'Create league' : 'Join league'}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      <div className="section-title">Your leagues</div>
      {rooms === null && <p className="muted">Loading…</p>}
      {rooms?.length === 0 && !error && (
        <div className="card empty-rooms">
          <div>No leagues yet. Start one and send the link to the group chat.</div>
        </div>
      )}
      {rooms?.map((r) => (
        <button key={r.id} className="room-tile" onClick={() => onOpen(r.id)}>
          <div className="room-badge">{r.name.trim()[0]?.toUpperCase() || '#'}</div>
          <div className="room-tile-main">
            <div className="room-tile-name">{r.name}</div>
            <div className="muted small">
              {r.members} {r.members === 1 ? 'member' : 'members'} · {r.slips} {r.slips === 1 ? 'slip' : 'slips'}
            </div>
          </div>
          <span className="watch">›</span>
        </button>
      ))}
      </>
      )}
    </div>
  );
}
