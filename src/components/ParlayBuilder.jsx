import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { describeLeg } from '../lib/evaluate.js';
import LegForm from './LegForm.jsx';

export default function ParlayBuilder({ onCancel, onSaved }) {
  const [name, setName] = useState('');
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('');
  const [legs, setLegs] = useState([]);
  const [adding, setAdding] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
          onCancel={legs.length ? () => setAdding(false) : null}
        />
      ) : (
        <button className="secondary" onClick={() => setAdding(true)}>
          + Add another leg
        </button>
      )}

      {error && <p className="error">{error}</p>}
      <button className="primary big" disabled={!legs.length || saving} onClick={save}>
        {saving ? 'Saving…' : `Save parlay (${legs.length} leg${legs.length === 1 ? '' : 's'})`}
      </button>
    </div>
  );
}
