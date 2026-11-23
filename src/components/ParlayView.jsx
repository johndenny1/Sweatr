import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { getBox } from '../lib/api.js';
import { evaluateLeg, parlayStatus, describeLeg } from '../lib/evaluate.js';
import { saveResult } from '../lib/settle.js';
import RecapSheet from './RecapSheet.jsx';
import { fmtSubmitted } from '../lib/when.js';
import { payoutFor, toWin, fmtMoney } from '../lib/money.js';

const REFRESH_MS = 30_000;
const STATUS_TEXT = { pending: 'Not started', live: 'Live', won: 'Hit', lost: 'Miss', push: 'Push' };

export default function ParlayView({ id, userId, backLabel = 'All parlays', onBack, onOpenGame }) {
  const [parlay, setParlay] = useState(null);
  const [boxes, setBoxes] = useState({}); // key `${league}:${gameId}` → { game, players }
  const [updated, setUpdated] = useState(null);
  const [error, setError] = useState('');
  const [showRecap, setShowRecap] = useState(false);

  useEffect(() => {
    supabase
      .from('parlays')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => (error ? setError(error.message) : setParlay(data)));
  }, [id]);

  const refresh = useCallback(async () => {
    if (!parlay) return;
    const keys = [...new Set(parlay.legs.map((l) => `${l.league}:${l.gameId}`))];
    const results = await Promise.allSettled(
      keys.map((k) => {
        const [league, gameId] = k.split(':');
        return getBox(league, gameId).then((box) => [k, box]);
      })
    );
    setBoxes((prev) => {
      const next = { ...prev };
      for (const r of results) if (r.status === 'fulfilled') next[r.value[0]] = r.value[1];
      return next;
    });
    const failed = results.find((r) => r.status === 'rejected');
    setError(failed ? failed.reason.message : '');
    setUpdated(new Date());
  }, [parlay]);

  const legResults = parlay
    ? parlay.legs.map((leg) => {
        const box = boxes[`${leg.league}:${leg.gameId}`];
        return { leg, box, result: evaluateLeg(leg, box?.game, box?.players) };
      })
    : [];
  const allFinal = legResults.length > 0 && legResults.every((r) => r.box?.game?.isFinal);

  // Poll while any game is unfinished
  useEffect(() => {
    if (!parlay) return;
    refresh();
    if (allFinal) return;
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [parlay, allFinal, refresh]);

  // Save the result once the parlay is decided so it counts toward winnings.
  const decided = parlay && legResults.length ? parlayStatus(legResults.map((r) => r.result)) : null;
  useEffect(() => {
    if (parlay && parlay.user_id === userId && (decided === 'won' || decided === 'lost') && Object.keys(boxes).length)
      saveResult(parlay, decided);
  }, [parlay, decided, boxes, userId]);

  async function remove() {
    if (!window.confirm('Delete this parlay?')) return;
    await supabase.from('parlays').delete().eq('id', id);
    onBack();
  }

  if (!parlay) return <p className="muted">{error || 'Loading…'}</p>;

  const overall = parlayStatus(legResults.map((r) => r.result));
  const hits = legResults.filter((r) => r.result.status === 'won').length;

  // Group legs under their game
  const groups = [];
  for (const r of legResults) {
    const key = `${r.leg.league}:${r.leg.gameId}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, leg: r.leg, box: r.box, items: [] }));
    g.items.push(r);
  }

  return (
    <div className="stack">
      <button className="back-btn" onClick={onBack}>
        <svg className="back-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        <span>{backLabel}</span>
      </button>

      <div className={`card hero status-${overall}`}>
        <div className="row between">
          <h2>
            {parlay.name}
            {parlay.verified ? <span className="vbadge on">✓ Verified</span> : <span className="vbadge off">Unverified</span>}
          </h2>
          <span className={`pill status-${overall}`}>{STATUS_TEXT[overall]}</span>
        </div>
        <div className="submitted">Submitted {fmtSubmitted(parlay.created_at)}</div>
        {!parlay.verified && parlay.verify_note && (
          <div className="muted small">Not counted in stats · {parlay.verify_note}</div>
        )}
        <div className="muted small">
          {hits}/{parlay.legs.length} legs hit
          {parlay.odds ? ` · ${parlay.odds}` : ''}
          {parlay.stake != null ? ` · ${fmtMoney(parlay.stake)} stake` : ''}
        </div>
        {payoutFor(parlay.stake, parlay.odds) != null && (
          <div className={`hero-money ${overall}`}>
            {overall === 'won'
              ? `Cashed ${fmtMoney(payoutFor(parlay.stake, parlay.odds))}`
              : overall === 'lost'
                ? `Lost ${fmtMoney(parlay.stake)}`
                : `To win ${fmtMoney(toWin(parlay.stake, parlay.odds))}`}
          </div>
        )}
      </div>

      <button className="recap-btn" onClick={() => setShowRecap(true)}>
        <span className="recap-btn-icon">↗</span>
        {overall === 'won' ? 'Share the cash' : overall === 'lost' ? 'Share the bad beat' : 'Share the sweat'}
      </button>
      {showRecap && (
        <RecapSheet parlay={parlay} rows={legResults} overall={overall} onClose={() => setShowRecap(false)} />
      )}

      {groups.map((g) => {
        const game = g.box?.game;
        return (
          <div key={g.key} className="card stack">
            <button
              className="row between game-head game-link"
              onClick={() =>
                onOpenGame?.(g.leg.league, g.leg.gameId, g.leg.date, g.items.map((x) => x.leg))
              }
            >
              <div className="title">
                {game ? `${game.away} ${game.awayScore ?? ''}` : g.leg.away}
                <span className="muted"> @ </span>
                {game ? `${game.home} ${game.homeScore ?? ''}` : g.leg.home}
              </div>
              <div className={`small ${game?.isLive ? 'live' : 'muted'}`}>
                {game?.isLive && <span className="dot" />}
                {game
                  ? game.detail ||
                    (game.start
                      ? new Date(game.start).toLocaleString([], {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : game.status)
                  : g.leg.league.toUpperCase()}
                <span className="watch">›</span>
              </div>
            </button>

            {g.items.map(({ leg, result }) => (
              <div key={leg.id} className={`leg status-${result.status}`}>
                <div className="row between">
                  <div>{describeLeg(leg)}</div>
                  <span className={`pill status-${result.status}`}>{STATUS_TEXT[result.status]}</span>
                </div>
                {result.progress !== undefined && (
                  <div className="bar">
                    <div style={{ width: `${Math.round(result.progress * 100)}%` }} />
                  </div>
                )}
                <div className="muted small">
                  {result.summary}
                  {result.need ? ` · needs ${result.need} more` : ''}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {error && <p className="error">{error}</p>}
      <p className="muted small center">
        {allFinal ? 'All games final' : `Auto-refreshes every ${REFRESH_MS / 1000}s`}
        {updated ? ` · updated ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
      </p>
      {parlay.user_id !== userId ? (
        <p className="muted small center">Shared in your room · read only</p>
      ) : parlay.verified ? (
        <p className="muted small center">Verified slips stay on your record and can't be deleted.</p>
      ) : (
        <button className="link danger center" onClick={remove}>
          Delete slip
        </button>
      )}
    </div>
  );
}
