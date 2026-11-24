import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { describeLeg } from '../lib/evaluate.js';
import { payoutFor, toWin, fmtMoney } from '../lib/money.js';
import LegForm from './LegForm.jsx';
import Scanner from './Scanner.jsx';
import { legFingerprint, legsMatchScan, sameOdds, sameStake } from '../lib/fingerprint.js';

export default function ParlayBuilder({ onCancel, onSaved, onVibeCheck }) {
  const [name, setName] = useState('');
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('');
  const [legs, setLegs] = useState([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unmatched, setUnmatched] = useState([]);
  const [scan, setScan] = useState(null); // { token, stake, odds, prints, duplicate }

  function onScan({ matched, unmatched, stake: s, odds: o, rawLegs, token, duplicate, placed }) {
    setError('');
    // A new scan replaces the slip, so the receipt and legs always line up.
    setLegs(matched);
    setUnmatched(unmatched);
    setScan({ token, stake: s, odds: o, prints: (rawLegs || []).map(legFingerprint), duplicate, placed });
    setStake(s != null ? String(s) : '');
    setOdds(o || '');
    if (!matched.length) setAdding(true);
  }

  // Preview of what the server will decide (the server re-checks everything, plus kickoff times).
  let verifyNote = null;
  if (!scan) verifyNote = 'Added by hand';
  else if (!scan.token) verifyNote = 'Verification is off (server key missing)';
  else if (scan.duplicate) verifyNote = 'This screenshot was already used';
  else if (scan.placed === false) verifyNote = 'This bet hasn’t been placed yet, so it can’t be verified. Place it, then scan it from your open bets';
  else if (legs.length < scan.prints.length) verifyNote = `Add the ${scan.prints.length - legs.length} unmatched leg${scan.prints.length - legs.length === 1 ? '' : 's'} to verify`;
  else if (!legsMatchScan(legs, scan.prints)) verifyNote = "Legs don't match the slip";
  else if (scan.stake == null) verifyNote = "Stake wasn't readable on the slip";
  else if (!sameStake(stake, scan.stake)) verifyNote = "Stake doesn't match the slip";
  else if (!sameOdds(odds, scan.odds)) verifyNote = "Odds don't match the slip";

  async function save() {
    setSaving(true);
    setError('');
    const payload = {
      name: name.trim() || `${legs.length}-leg parlay`,
      stake: stake === '' ? null : Number(stake),
      odds: odds.trim() || null,
      legs,
    };
    try {
      const { data: auth } = await supabase.auth.getSession();
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth?.session?.access_token || ''}` },
        body: JSON.stringify({ ...payload, token: scan?.token || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return onSaved(body.id);
      if (!body.fallback) throw new Error(body.error || `Save failed (${res.status})`);
      // Server verification not set up yet: save directly (always Unverified).
      const { data, error } = await supabase.from('parlays').insert(payload).select('id').single();
      if (error) throw error;
      onSaved(data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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

      {onVibeCheck && (
        <button className="vibe-link" onClick={onVibeCheck}>
          <span>✨</span>
          <span>
            <b>Haven’t placed it yet?</b> Sweat check it first. Nothing gets saved.
          </span>
          <span className="watch">›</span>
        </button>
      )}

      <Scanner onResult={onScan} onError={setError} checkPlaced />

      <div className="or-divider">
        <span>or build it yourself</span>
      </div>

      <div className="manual-note">
        <span className="vbadge off sm">Unverified</span>
        <span>
          Slips you build by hand are for tracking only and <b>don’t count toward your stats</b>. Scan your slip to get it verified.
        </span>
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

        {legs.length > 0 &&
          (verifyNote ? (
            <div className="verify-line off">
              <span className="vbadge off">Unverified</span> {verifyNote}
            </div>
          ) : (
            <div className="verify-line on">
              <span className="vbadge on">✓ Verified</span> if saved before the first game starts
            </div>
          ))}

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
