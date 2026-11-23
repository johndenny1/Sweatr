import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { refreshStatuses } from '../lib/settle.js';
import { computeRecord } from '../lib/record.js';
import { fmtMoney } from '../lib/money.js';
import { Avatar, displayName } from '../lib/profile.jsx';
import { uploadAvatar, removeAvatar } from '../lib/avatar.js';
import { CameraIcon } from './Icons.jsx';
import Footer from './Footer.jsx';

function Stat({ label, value, tone }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone || ''}`}>{value}</div>
    </div>
  );
}

export default function Profile({ user, onUserChange }) {
  const [parlays, setParlays] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName(user));
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoRef = useRef(null);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      onUserChange?.(await uploadAvatar(user, file));
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemovePhoto() {
    setPhotoBusy(true);
    setPhotoError('');
    try {
      onUserChange?.(await removeAvatar(user));
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    supabase
      .from('parlays')
      .select('*')
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        if (!alive) return;
        setParlays(data || []);
        const s = await refreshStatuses(data || []);
        if (alive) setStatuses(s);
      });
    return () => {
      alive = false;
    };
  }, []);

  const r = useMemo(() => computeRecord(parlays, statuses), [parlays, statuses]);
  const maxLeague = Math.max(1, ...r.leagues.map((l) => l.count));

  const [deleting, setDeleting] = useState(false);
  async function deleteAccount() {
    const typed = window.prompt('This permanently deletes your account, slips and photo. Type DELETE to confirm.');
    if (typed !== 'DELETE') return;
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data?.session?.access_token || ''}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not delete account');
      await supabase.auth.signOut();
    } catch (err) {
      window.alert(err.message);
      setDeleting(false);
    }
  }

  async function saveName() {
    const clean = name.trim().slice(0, 24);
    if (!clean) return;
    setSaving(true);
    const { data } = await supabase.auth.updateUser({ data: { username: clean } });
    setSaving(false);
    setEditing(false);
    if (data?.user) onUserChange?.(data.user);
  }

  return (
    <div className="stack profile">
      <div className="profile-head">
        <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        <button
          className={`avatar-edit ${photoBusy ? 'busy' : ''}`}
          onClick={() => !photoBusy && photoRef.current?.click()}
          aria-label="Change profile picture"
        >
          <Avatar user={user} size={96} />
          <span className="avatar-cam">{photoBusy ? <span className="spinner" /> : <CameraIcon width={16} height={16} />}</span>
        </button>
        {user?.user_metadata?.avatar_url && !photoBusy && (
          <button className="link small" onClick={onRemovePhoto}>
            Remove photo
          </button>
        )}
        {photoError && <p className="error small">{photoError}</p>}
        {editing ? (
          <div className="row gap">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus />
            <button className="primary" disabled={saving} onClick={saveName}>
              Save
            </button>
          </div>
        ) : (
          <button className="profile-name" onClick={() => setEditing(true)}>
            {displayName(user)} <span className="edit">Edit</span>
          </button>
        )}
        <div className="muted small">
          {user.email} · member since{' '}
          {new Date(user.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
        </div>
      </div>

      <div className="bank-card">
        <div className="bank-label">All-time profit</div>
        <div className={`bank-net ${r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}`}>{fmtMoney(r.net, { sign: true })}</div>
        <div className="muted small">
          {fmtMoney(r.returned)} returned on {fmtMoney(r.staked)} wagered · verified slips only
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Record" value={`${r.wins}-${r.losses}`} />
        <Stat label="Hit rate" value={r.winRate == null ? '–' : `${Math.round(r.winRate * 100)}%`} />
        <Stat label="ROI" value={r.roi == null ? '–' : `${r.roi > 0 ? '+' : ''}${Math.round(r.roi * 100)}%`} tone={r.roi > 0 ? 'pos' : r.roi < 0 ? 'neg' : ''} />
        <Stat label="Biggest hit" value={r.biggest.profit > 0 ? fmtMoney(r.biggest.profit, { sign: true }) : '–'} tone={r.biggest.profit > 0 ? 'pos' : ''} />
        <Stat
          label="Streak"
          value={r.streak.count ? `${r.streak.type === 'won' ? 'W' : 'L'}${r.streak.count}` : '–'}
          tone={r.streak.type === 'won' ? 'pos' : r.streak.type === 'lost' ? 'neg' : ''}
        />
        <Stat label="Avg legs" value={r.avgLegs ? r.avgLegs.toFixed(1) : '–'} />
        <Stat label="Slips" value={r.total} />
        <Stat label="Open" value={r.open} />
      </div>

      <div className="card stack">
        <div className="label">Last 10</div>
        {r.form.length ? (
          <div className="form-strip big">
            {[...r.form].reverse().map((x, i) => (
              <span key={i} className={`form-pip ${x}`}>
                {x === 'won' ? 'W' : 'L'}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">Results show up here once your slips settle.</p>
        )}
      </div>

      <div className="card stack">
        <div className="label">What you bet on</div>
        {r.leagues.length ? (
          r.leagues.map((l) => (
            <div key={l.id} className="league-row">
              <span className="league-tag">{l.id.toUpperCase()}</span>
              <div className="league-bar">
                <div style={{ width: `${(l.count / maxLeague) * 100}%` }} />
              </div>
              <span className="small muted">
                {l.count} leg{l.count === 1 ? '' : 's'}
              </span>
            </div>
          ))
        ) : (
          <p className="muted small">No legs yet.</p>
        )}
      </div>

      <button className="secondary" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
      <button className="link danger center" onClick={deleteAccount} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete account'}
      </button>
      <Footer />
    </div>
  );
}
