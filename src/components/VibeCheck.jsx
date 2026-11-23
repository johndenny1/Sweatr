import { useState } from 'react';
import Scanner from './Scanner.jsx';
import { ScoutReport } from './ScoutSheet.jsx';
import { describeLeg } from '../lib/evaluate.js';

const RATING_TEXT = { strong: 'Strong', fair: 'Fair', weak: 'Weak' };

// Sweat Check: scan a slip you HAVEN'T placed yet and get the scout report.
// Nothing is saved, verified or counted toward your record.
export default function VibeCheck({ onBack, onTrackInstead }) {
  const [legs, setLegs] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [odds, setOdds] = useState('');
  const [stake, setStake] = useState('');
  const [error, setError] = useState('');
  const [run, setRun] = useState(0);
  const [ratings, setRatings] = useState({}); // leg index → strong | fair | weak
  const [scanned, setScanned] = useState(0); // legs on the slip as scanned (odds only apply to the full slip)

  function onScan({ matched, unmatched: um, odds: o, stake: s }) {
    setError('');
    setLegs(matched);
    setScanned(matched.length + um.length);
    setUnmatched(um);
    setOdds(o || '');
    setStake(s != null ? String(s) : '');
    setRatings({});
    setRun((n) => n + 1);
  }

  return (
    <div className="stack vibe">
      <button className="back-btn" onClick={onBack}>
        <svg className="back-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        <span>Slips</span>
      </button>

      <div className="rooms-hero">
        <div className="rooms-kicker">Before you place it</div>
        <h1>Sweat Check</h1>
        <p className="muted">
          Building a parlay on Kalshi, DraftKings or anywhere else? Screenshot it before you place it and we’ll scout every leg.
          Nothing gets saved or counted toward your record.
        </p>
      </div>

      <Scanner onResult={onScan} onError={setError} />
      {error && <p className="error">{error}</p>}

      {legs.length > 0 && (
        <div className="card vibe-legs">
          <div className="row between">
            <div className="label">
              {legs.length} leg{legs.length === 1 ? '' : 's'}
              {odds ? ` · ${odds}` : ''}
            </div>
            <span className="vbadge off sm">Not saved</span>
          </div>
          {legs.map((l, i) => (
            <div key={l.id || i} className={`vibe-leg ${ratings[i] ? `rate-${ratings[i]}` : ''}`}>
              <span className="league-tag">{l.league.toUpperCase()}</span>
              <span className="grow">{describeLeg(l)}</span>
              {ratings[i] && <span className={`scout-pill rate-${ratings[i]}`}>{RATING_TEXT[ratings[i]]}</span>}
              <button
                className="x-btn"
                aria-label="Drop this leg"
                onClick={() => {
                  setLegs(legs.filter((_, j) => j !== i));
                  setRatings({});
                  setRun((n) => n + 1);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {unmatched.length > 0 && (
            <div className="muted small">
              Couldn’t read {unmatched.length} leg{unmatched.length === 1 ? '' : 's'}: {unmatched.map((u) => u.label).join(', ')}
            </div>
          )}
          <div className="muted small">Drop a leg to see how the slip looks without it.</div>
        </div>
      )}

      {legs.length > 0 && <ScoutReport key={run} onRatings={setRatings} legs={legs} odds={legs.length === scanned ? odds : ''} stake={stake} />}

      {legs.length > 0 && (
        <button className="link small center" onClick={onTrackInstead}>
          Already placed it? Track it on the New slip page to get it verified.
        </button>
      )}
    </div>
  );
}
