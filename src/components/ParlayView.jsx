import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { getBox } from '../lib/api.js';
import { evaluateLeg, parlayStatus, describeLeg } from '../lib/evaluate.js';

const REFRESH_MS = 30_000;
const STATUS_TEXT = { pending: 'Not started', live: 'Live', won: 'Hit', lost: 'Miss', push: 'Push' };

export default function ParlayView({ id, onBack, onOpenGame }) {
  const [parlay, setParlay] = useState(null);
  const [boxes, setBoxes] = useState({}); // key `${league}:${gameId}` → { game, players }
  const [updated, setUpdated] = useState(null);
  const [error, setError] = useState('');

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
      <button className="link" onClick={onBack}>
        ← All parlays
      </button>

      <div className={`card hero status-${overall}`}>
        <div className="row between">
          <h2>{parlay.name}</h2>
          <span className={`pill status-${overall}`}>{STATUS_TEXT[overall]}</span>
        </div>
        <div className="muted small">
          {hits}/{parlay.legs.length} legs hit
          {parlay.odds ? ` · ${parlay.odds}` : ''}
          {parlay.stake != null ? ` · $${parlay.stake} stake` : ''}
        </div>
      </div>

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
      <button className="link danger center" onClick={remove}>
        Delete parlay
      </button>
    </div>
  );
}
