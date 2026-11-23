import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { MIN_AGE } from '../lib/legal.js';

// Shown once to accounts created before the age check existed.
export default function AgeGate({ onConfirmed }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase.auth.updateUser({ data: { age_confirmed_at: now, terms_accepted_at: now } });
    setBusy(false);
    if (error) return setError(error.message);
    onConfirmed(data.user);
  }

  return (
    <div className="age-gate">
      <div className="card stack age-card">
        <h2>Quick check</h2>
        <p className="muted">Sweatr is only for people {MIN_AGE} and older.</p>
        <label className="check-row">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>
            I'm {MIN_AGE} or older and agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
          </span>
        </label>
        {error && <p className="error small">{error}</p>}
        <button className="primary" disabled={!checked || busy} onClick={confirm}>
          Continue
        </button>
        <button className="link center" onClick={() => supabase.auth.signOut()}>
          I'm under {MIN_AGE} · sign out
        </button>
      </div>
    </div>
  );
}
