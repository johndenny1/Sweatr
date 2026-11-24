import { useEffect, useState } from 'react';
import { rankRows, pct } from '../lib/social.js';
import { fmtMoney } from '../lib/money.js';
import { initials } from '../lib/profile.jsx';

const PERIODS = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

export function Face({ name, src, size = 38 }) {
  return (
    <div className="face" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </div>
  );
}

// Ranked leaderboard by ROI (profit ÷ amount staked), verified slips only.
export default function Standings({ load, meId, onPick, emptyText }) {
  const [period, setPeriod] = useState('week');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError('');
    load(period)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const { ranked, unranked, min } = rows ? rankRows(rows, period) : { ranked: [], unranked: [], min: 0 };

  return (
    <div className="standings">
      <div className="chart-ranges period-tabs">
        {PERIODS.map((p) => (
          <button key={p.id} className={p.id === period ? 'on' : ''} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted center small">Loading standings…</p>}

      {rows && ranked.length === 0 && (
        <div className="card muted center small">{emptyText || `Nobody has ${min}+ verified slips yet ${period === 'all' ? '' : 'in this stretch'}.`}</div>
      )}

      <div className="rank-list">
        {ranked.map((r) => (
          <button key={r.user_id} className={`rank-row ${r.user_id === meId ? 'me' : ''} ${r.rank <= 3 ? `podium p${r.rank}` : ''}`} onClick={() => onPick?.(r)}>
            <span className="rank-num">{r.rank}</span>
            <Face name={r.display_name} src={r.avatar_url} size={38} />
            <span className="rank-who">
              <b>
                {r.user_id === meId ? 'You' : r.display_name || 'Someone'}
                {r.streak.count >= 3 && <em className={r.streak.type === 'won' ? 'hot' : 'cold'}>{r.streak.type === 'won' ? '🔥' : '🧊'}{r.streak.count}</em>}
              </b>
              <span>
                {r.wins}-{r.losses}
                {r.handle ? ` · @${r.handle}` : ''}
              </span>
            </span>
            <span className="rank-nums">
              <b className={r.roi > 0 ? 'pos-text' : r.roi < 0 ? 'neg-text' : ''}>{pct(r.roi)}</b>
              <span>{fmtMoney(r.profit, { sign: true })}</span>
            </span>
          </button>
        ))}
      </div>

      {unranked.length > 0 && (
        <div className="unranked">
          <div className="label">Not ranked yet · needs {min} verified slips</div>
          {unranked.map((r) => (
            <button key={r.user_id} className="rank-row quiet" onClick={() => onPick?.(r)}>
              <span className="rank-num">–</span>
              <Face name={r.display_name} src={r.avatar_url} size={32} />
              <span className="rank-who">
                <b>{r.user_id === meId ? 'You' : r.display_name || 'Someone'}</b>
                <span>
                  {r.slips}/{min} slips
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="muted small center">Ranked by ROI (profit ÷ amount bet), verified slips only.</p>
    </div>
  );
}
