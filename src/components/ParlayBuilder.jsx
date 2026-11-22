import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { describeLeg } from '../lib/evaluate.js';
import LegForm from './LegForm.jsx';
import { readSlip, resolveLegs } from '../lib/scan.js';

export default function ParlayBuilder({ onCancel, onSaved }) {
  const [name, setName] = useState('');
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('');
  const [legs, setLegs] = useState([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState('');
  const [unmatched, setUnmatched] = useState([]);
  const fileRef = useRef(null);

  async function scan(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUnmatched([]);
    try {
      setScanning('Reading your slip…');
      const slip = await readSlip(file);
      if (!slip.legs.length) throw new Error("Didn't find any legs. Try a clearer screenshot of the bet slip.");
      setScanning(`Matching ${slip.legs.length} leg${slip.legs.length === 1 ? '' : 's'} to games…`);
      const { matched, unmatched } = await resolveLegs(slip.legs);
      setLegs((prev) => [...prev, ...matched]);
      setUnmatched(unmatched);
      if (slip.stake != null && stake === '') setStake(String(slip.stake));
      if (slip.odds && !odds) setOdds(slip.odds);
      setAdding(!matched.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning('');
    }
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

  return (
    <div className="stack">
      <div className="row between">
        <h2>New parlay</h2>
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={scan} />
      <button className="primary big" disabled={!!scanning} onClick={() => fileRef.current?.click()}>
        {scanning || 'Scan bet slip'}
      </button>
      <p className="muted small center">Upload a screenshot and Sweatr fills in the legs, or add them by hand below.</p>

      {unmatched.length > 0 && (
        <div className="card stack warn">
          <div className="title small">Add these by hand</div>
          {unmatched.map((u, i) => (
            <div key={i} className="small">
              <div>{u.label}</div>
              <div className="muted">{u.reason}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack">
        <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row gap">
          <input
            inputMode="decimal"
            placeholder="Stake $"
            value={stake}
            onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <input placeholder="Odds (e.g. +650)" value={odds} onChange={(e) => setOdds(e.target.value)} />
        </div>
      </div>

      {legs.length > 0 && (
        <div className="card stack">
          {legs.map((leg, i) => (
            <div key={leg.id} className="row between leg-line">
              <div>
                <div>{describeLeg(leg)}</div>
                <div className="muted small">
                  {leg.league.toUpperCase()} · {leg.gameLabel}
                </div>
              </div>
              <button className="link danger" onClick={() => setLegs(legs.filter((_, j) => j !== i))}>
                Remove
              </button>
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
        <button className="secondary" onClick={() => setAdding(true)}>
          {legs.length ? '+ Add a leg by hand' : 'Add legs by hand'}
        </button>
      )}

      {error && <p className="error">{error}</p>}
      <button className="primary big" disabled={!legs.length || saving} onClick={save}>
        {saving ? 'Saving…' : `Save parlay (${legs.length} leg${legs.length === 1 ? '' : 's'})`}
      </button>
    </div>
  );
}
