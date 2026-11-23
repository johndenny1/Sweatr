import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { refreshStatuses } from '../lib/settle.js';
import { computeRecord } from '../lib/record.js';
import { describeLeg } from '../lib/evaluate.js';
import { payoutFor, toWin, fmtMoney } from '../lib/money.js';
import { Avatar, displayName } from '../lib/profile.jsx';
import { CameraIcon } from './Icons.jsx';
import Footer from './Footer.jsx';
import { fmtSubmitted } from '../lib/when.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'open', label: 'Open' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];
const STAMP = { won: 'Cashed', lost: 'Busted', live: 'Live', pending: 'Open' };

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late sweat';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Prime time';
}

function Ticket({ parlay, status, onOpen }) {
  const legs = parlay.legs || [];
  const shown = legs.slice(0, 3);
  const stake = Number(parlay.stake) > 0 ? Number(parlay.stake) : null;
  const win = toWin(parlay.stake, parlay.odds);
  const paid = parlay.payout ?? payoutFor(parlay.stake, parlay.odds);
  const leagues = [...new Set(legs.map((l) => l.league.toUpperCase()))];

  return (
    <button className={`ticket ticket-${status}`} onClick={onOpen}>
      <div className="ticket-top">
        <div>
          <div className="ticket-name">
            {parlay.name}
            {parlay.verified ? <span className="vbadge on sm">✓</span> : <span className="vbadge off sm">Unverified</span>}
          </div>
          <div className="ticket-sub">
            {leagues.map((l) => (
              <span key={l} className="league-tag">
                {l}
              </span>
            ))}
            <span className="muted">
              {legs.length} leg{legs.length === 1 ? '' : 's'} ·{' '}
              {fmtSubmitted(parlay.created_at)}
            </span>
          </div>
        </div>
        <span className={`stamp stamp-${status}`}>
          {status === 'live' && <span className="dot" />}
          {STAMP[status] || 'Open'}
        </span>
      </div>

      <div className="ticket-legs">
        {shown.map((leg) => (
          <div key={leg.id} className="ticket-leg">
            <span className="leg-bullet" />
            <span className="leg-desc">{describeLeg(leg)}</span>
          </div>
        ))}
        {legs.length > shown.length && <div className="muted small">+{legs.length - shown.length} more</div>}
      </div>

      <div className="perf" />

      <div className="ticket-foot">
        <div>
          <div className="foot-label">Stake</div>
          <div className="foot-val">{stake ? fmtMoney(stake) : '–'}</div>
        </div>
        <div>
          <div className="foot-label">Odds</div>
          <div className="foot-val">{parlay.odds || '–'}</div>
        </div>
        <div className="right">
          <div className="foot-label">{status === 'won' ? 'Paid' : status === 'lost' ? 'Lost' : 'To win'}</div>
          <div className={`foot-val big ${status === 'won' ? 'pos' : status === 'lost' ? 'neg' : ''}`}>
            {status === 'won' ? fmtMoney(paid) : status === 'lost' ? (stake ? `-${fmtMoney(stake)}` : '–') : win != null ? fmtMoney(win) : '–'}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function Home({ user, onNew, onOpen, onProfile }) {
  const [parlays, setParlays] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase
      .from('parlays')
      .select('*')
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        const list = data || [];
        setParlays(list);
        const s = await refreshStatuses(list);
        if (alive) setStatuses(s);
      });
    return () => {
      alive = false;
    };
  }, []);

  const record = useMemo(() => computeRecord(parlays || [], statuses), [parlays, statuses]);
  const statusOf = (p) => statuses[p.id] || p.status || 'pending';
  const counts = useMemo(() => {
    const c = { all: 0, live: 0, open: 0, won: 0, lost: 0 };
    for (const p of parlays || []) {
      const s = statusOf(p);
      c.all++;
      if (s === 'live') c.live++;
      if (s === 'live' || s === 'pending') c.open++;
      if (s === 'won') c.won++;
      if (s === 'lost') c.lost++;
    }
    return c;
  }, [parlays, statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = (parlays || []).filter((p) => {
    const s = statusOf(p);
    if (filter === 'all') return true;
    if (filter === 'open') return s === 'live' || s === 'pending';
    return s === filter;
  });

  const net = record.net;

  return (
    <div className="stack home">
      <div className="row between hello">
        <div>
          <div className="hello-small">{greeting()},</div>
          <div className="hello-name">{displayName(user)}</div>
        </div>
        <button className="avatar-btn" onClick={onProfile} aria-label="Profile">
          <Avatar user={user} size={48} />
        </button>
      </div>

      <div className="bank-card">
        <div className="bank-label">Net profit</div>
        <div className={`bank-net ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}`}>{fmtMoney(net, { sign: true })}</div>
        <div className="bank-row">
          <div>
            <div className="bank-k">Record</div>
            <div className="bank-v">
              {record.wins}-{record.losses}
            </div>
          </div>
          <div>
            <div className="bank-k">Hit rate</div>
            <div className="bank-v">{record.winRate == null ? '–' : `${Math.round(record.winRate * 100)}%`}</div>
          </div>
          <div>
            <div className="bank-k">Wagered</div>
            <div className="bank-v">{fmtMoney(record.staked)}</div>
          </div>
          <div>
            <div className="bank-k">Live</div>
            <div className="bank-v">{counts.live}</div>
          </div>
        </div>
        {record.form.length > 0 && (
          <div className="form-strip">
            {[...record.form].reverse().map((r, i) => (
              <span key={i} className={`form-pip ${r}`}>
                {r === 'won' ? 'W' : 'L'}
              </span>
            ))}
            {record.streak.count >= 2 && (
              <span className={`streak ${record.streak.type}`}>
                {record.streak.type === 'won' ? 'Heater' : 'Cold'} · {record.streak.count} straight
              </span>
            )}
          </div>
        )}
      </div>

      {record.unverified > 0 && (
        <p className="muted small verify-foot">
          Stats count verified slips only · {record.unverified} unverified slip{record.unverified === 1 ? '' : 's'} not counted
        </p>
      )}

      <div className="chips scroll-x">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="chip-count">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {parlays === null && <div className="skeleton" />}

      {parlays?.length === 0 && (
        <div className="empty">
          <div className="empty-big">No slips yet</div>
          <p className="muted">Snap a screenshot of a bet slip and Sweatr builds the tracker for you.</p>
          <button className="primary big" onClick={onNew}>
            <CameraIcon width={20} height={20} /> Scan your first slip
          </button>
        </div>
      )}

      {parlays?.length > 0 && visible.length === 0 && <p className="muted center small">Nothing here.</p>}

      {visible.map((p) => (
        <Ticket key={p.id} parlay={p} status={statusOf(p)} onOpen={() => onOpen(p.id)} />
      ))}
      <Footer />
    </div>
  );
}
