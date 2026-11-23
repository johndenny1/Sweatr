import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { describeLeg } from '../lib/evaluate.js';
import { payoutFor, toWin, fmtMoney } from '../lib/money.js';
import LegForm from './LegForm.jsx';
import Scanner from './Scanner.jsx';

export default function ParlayBuilder({ onCancel, onSaved }) {
  const [name, setName] = useState('');
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('');
  const [legs, setLegs] = useState([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unmatched, setUnmatched] = useState([]);

  function onScan({ matched, unmatched, stake: s, odds: o }) {
    setError('');
    setLegs((prev) => [...prev, ...matched]);
    setUnmatched(unmatched);
    if (s != null && stake === '') setStake(String(s));
    if (o && !odds) setOdds(o);
    if (!matched.length) setAdding(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    const { data, error } = await supabase
      .from('parlays')
      .insert({
        name: name.trim() || `${legs.length}-leg parlay`,
        stake: stake === '' ? null : Number(stake),
        odds: odds.trim() || null,
        legs,
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) return setError(error.message);
    onSaved(data.id);
  }

  const win = toWin(stake, odds);
  const payout = payoutFor(stake, odds);

  return (
    <div className="stack builder">
      <div className="row between">
        <h2>New slip</h2>
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <Scanner onResult={onScan} onError={setError} />

      <div className="or-divider">
        <span>or build it yourself</span>
      </div>

      <div className="ticket ticket-builder">
        <div className="ticket-top">
          <input
            className="ticket-name-input"
            placeholder={legs.length ? `${legs.length}-leg parlay` : 'Name your slip'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="stamp stamp-pending">
            {legs.length} leg{legs.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="ticket-legs">
          {legs.length === 0 && <div className="muted small">Scanned or added legs land here.</div>}
          {legs.map((leg, i) => (
            <div key={leg.id} className="ticket-leg editable">
              <span className="league-tag">{leg.league.toUpperCase()}</span>
              <div className="grow">
                <div className="leg-desc">{describeLeg(leg)}</div>
                <div className="muted small">{leg.gameLabel}</div>
              </div>
              <button className="x-btn" aria-label="Remove leg" onClick={() => setLegs(legs.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
        </div>

        {unmatched.length > 0 && (
          <div className="unmatched">
            <div className="label">Couldn't match, add by hand</div>
            {unmatched.map((u, i) => (
              <div key={i} className="small">
                {u.label} <span className="muted">· {u.reason}</span>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <LegForm
            onAdd={(leg) => {
              setLegs([...legs, leg]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button className="add-leg" onClick={() => setAdding(true)}>
            + Add a leg
          </button>
        )}

        <div className="perf" />

        <div className="ticket-foot inputs">
          <label>
            <span className="foot-label">Stake</span>
            <input
              inputMode="decimal"
              placeholder="$0"
              value={stake}
              onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </label>
          <label>
            <span className="foot-label">Odds</span>
            <input placeholder="+650" value={odds} onChange={(e) => setOdds(e.target.value)} />
          </label>
          <div className="right">
            <div className="foot-label">To win</div>
            <div className="foot-val big pos">{win != null ? fmtMoney(win) : '–'}</div>
            {payout != null && <div className="muted small">pays {fmtMoney(payout)}</div>}
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="sticky-save">
        <button className="primary big" disabled={!legs.length || saving} onClick={save}>
          {saving ? 'Saving…' : legs.length ? `Track ${legs.length}-leg slip` : 'Add legs to track'}
        </button>
      </div>
    </div>
  );
}
