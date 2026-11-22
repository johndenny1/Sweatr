import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function ParlayList({ onNew, onOpen }) {
  const [parlays, setParlays] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('parlays')
      .select('id, name, stake, odds, legs, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setParlays(data || []);
      });
  }, []);

  return (
    <div className="stack">
      <button className="primary big" onClick={onNew}>
        + New parlay
      </button>
      {error && <p className="error">{error}</p>}
      {parlays === null && <p className="muted">Loading…</p>}
      {parlays?.length === 0 && <p className="muted center">No parlays yet. Add your first one.</p>}
      {parlays?.map((p) => (
        <button key={p.id} className="card row-card" onClick={() => onOpen(p.id)}>
          <div>
            <div className="title">{p.name}</div>
            <div className="muted small">
              {p.legs.length} leg{p.legs.length === 1 ? '' : 's'} · {new Date(p.created_at).toLocaleDateString()}
            </div>
          </div>
          <div className="right small">
            {p.odds && <div>{p.odds}</div>}
            {p.stake != null && <div className="muted">${p.stake}</div>}
          </div>
        </button>
      ))}
    </div>
  );
}
