import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase.js';
import { americanToDecimal } from '../lib/money.js';

const RATING_TEXT = { strong: 'Strong', okay: 'Okay', risky: 'Risky' };
const OVERALL_TONE = { Strong: 'won', Decent: 'live', Shaky: 'warn', 'Long shot': 'lost' };

async function fetchScout(payload) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/scout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Scout failed');
  return body;
}

const STEPS = ['Pulling recent games', 'Checking injuries and weather', 'Sizing it up'];

// The report itself: fetches and shows the scout for a list of legs.
export function ScoutReport({ legs, odds, stake }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [full, setFull] = useState(null); // second pass: takes, reasons, summary
  const [fullError, setFullError] = useState('');

  useEffect(() => {
    let alive = true;
    setResult(null);
    setFull(null);
    setFullError('');
    setError('');
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1200);
    fetchScout({ legs, odds, stake })
      .then((r) => {
        if (!alive) return;
        setResult(r);
        // Start writing the details right away, so Go deeper is usually ready by the time you tap it
        fetchScout({ mode: 'full', data: r.data, odds, ratings: r.report.legs.map((l) => ({ i: l.i, r: l.rating })) })
          .then((f) => alive && setFull(f.report))
          .catch((e) => alive && setFullError(e.message));
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => clearInterval(t));
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs.map((l) => l.id || `${l.gameId}${l.playerId}${l.line}`).join('|'), odds]);

  const [deep, setDeep] = useState(false);
  const dec = americanToDecimal(odds);
  const brief = result?.report;
  // Merge: ratings/verdict from the fast pass, written details from the full pass
  const report = brief && {
    ...brief,
    summary: full?.summary || '',
    watch: full?.watch?.length ? full.watch : brief.watch,
    legs: brief.legs.map((l) => {
      const f = full?.legs.find((x) => x.i === l.i);
      return { ...l, take: f?.take || '', reasons: f?.reasons || [] };
    }),
  };
  const data = result?.data;
  const count = (r) => report?.legs.filter((l) => l.rating === r).length || 0;

  return (
      <div className="scout-body">
        {!result && !error && (
          <div className="scout-loading">
            <span className="spinner" />
            <div>{STEPS.at(step)}…</div>
          </div>
        )}
        {error && <p className="error center">{error}</p>}

        {report && (
          <>
            <div className={`scout-overall tone-${OVERALL_TONE[report.overall] || 'live'}`}>
              <span className="scout-grade">{report.overall}</span>
              <div className="scout-headline">{report.headline}</div>
              <div className="scout-tally">
                {count('strong') > 0 && <span className="rate-strong">● {count('strong')} strong</span>}
                {count('okay') > 0 && <span className="rate-okay">● {count('okay')} okay</span>}
                {count('risky') > 0 && <span className="rate-risky">● {count('risky')} risky</span>}
              </div>
              {!deep && report.watch?.length > 0 && (
                <ul className="scout-quick">
                  {report.watch.slice(0, 2).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {deep && report.summary && <p>{report.summary}</p>}
              <div className="scout-chips">
                <span>{legs.length} legs</span>
                {odds && <span>{odds}</span>}
                {dec && <span>Book’s price: about 1 in {Math.round(dec)}</span>}
              </div>
            </div>

            {!deep && (
              <button className="scout-deeper" onClick={() => setDeep(true)}>
                Go deeper
                <small>Every leg’s last 5 games, injuries, weather and news</small>
              </button>
            )}

            {deep && (
            <>
            {report.watch?.length > 0 && (
              <div className="card scout-watch">
                <div className="label">Keep an eye on</div>
                {report.watch.map((w, i) => (
                  <div key={i} className="scout-watch-item">
                    <span>👀</span>
                    {w}
                  </div>
                ))}
              </div>
            )}

            {data.games.map((g) => (
              <div key={g.key} className="card scout-game">
                <div className="row between">
                  <b>{g.matchup}</b>
                  {g.start && (
                    <span className="muted small">
                      {new Date(g.start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="scout-wx">
                  {g.indoor === true && <span>🏟️ Indoors</span>}
                  {g.weather && (
                    <>
                      {g.weather.temp != null && <span>🌡️ {g.weather.temp}°</span>}
                      {g.weather.sky && <span>{g.weather.sky}</span>}
                      {g.weather.gust != null && <span>💨 gusts {g.weather.gust} mph</span>}
                      {g.weather.precip != null && g.weather.precip > 0 && <span>🌧️ {g.weather.precip}% rain</span>}
                    </>
                  )}
                  {!g.weather && g.indoor !== true && <span className="muted">No weather listed</span>}
                  {Object.entries(g.records || {}).map(([t, r]) => r && <span key={t}>{t} {r}</span>)}
                </div>
                {g.injuries.filter((x) => /out|doubtful|reserve/i.test(x.status)).length > 0 && (
                  <div className="scout-inj">
                    {g.injuries
                      .filter((x) => /out|doubtful|reserve/i.test(x.status))
                      .slice(0, 6)
                      .map((x) => (
                        <span key={x.id || x.name}>
                          {x.team} {x.name} <em>{x.status}</em>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            ))}

            <div className="scout-legs">
              {report.legs.map((r) => {
                const d = data.legs.find((x) => x.i === r.i) || {};
                return (
                  <div key={r.i} className={`scout-leg rate-${r.rating}`}>
                    <div className="row between scout-leg-head">
                      <span className="scout-leg-name">{d.desc}</span>
                      <span className={`scout-pill rate-${r.rating}`}>{RATING_TEXT[r.rating]}</span>
                    </div>
                    {r.take ? (
                      <div className="scout-take">{r.take}</div>
                    ) : (
                      <div className="scout-take muted">{fullError ? 'Couldn’t write the details this time.' : 'Writing the details…'}</div>
                    )}
                    {d.recent?.length > 0 && <LastFive recent={d.recent} line={Number(d.line)} side={d.side} />}
                    {d.news?.length > 0 && (
                      <div className="scout-news">
                        {d.news.map((a, i) => (
                          <a key={i} href={a.url || undefined} target="_blank" rel="noreferrer">
                            📰 {a.headline} <span className="muted">· ESPN</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {r.reasons?.length > 0 && (
                      <ul className="scout-reasons">
                        {r.reasons.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    )}
                    {d.teams && (
                      <div className="scout-teams">
                        {d.teams.map((t) => (
                          <div key={t.team}>
                            <b>{t.team}</b>
                            {t.record ? ` (${t.record})` : ''} · last 5:{' '}
                            <span className="scout-form">
                              {t.last5.map((x, i) => (
                                <i key={i} className={x.startsWith('W') ? 'w' : 'l'} title={x}>
                                  {x[0]}
                                </i>
                              ))}
                            </span>
                            {t.avgFor != null && (
                              <span className="muted">
                                {' '}
                                · {t.avgFor} for, {t.avgAgainst} against
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            </>
            )}

            <p className="muted small center scout-foot">
              Based on each player’s and team’s last 5 games, injury reports and the forecast. Recent games don’t guarantee
              anything, so treat this as a second opinion.
            </p>
          </>
        )}
      </div>
  );
}

// Full-screen version (used from a saved slip that hasn't started yet).
export default function ScoutSheet({ legs, odds, stake, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="recap-sheet scout-sheet" role="dialog" aria-label="Scout report">
      <div className="recap-top">
        <button className="recap-x" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="recap-title">
          <div className="recap-kicker">Before the games start</div>
          <h2>Scout Report</h2>
        </div>
        <span className="recap-x-spacer" />
      </div>
      <ScoutReport legs={legs} odds={odds} stake={stake} />
    </div>,
    document.body
  );
}

// Little bar chart: last 5 games vs. the line
function LastFive({ recent, line, side }) {
  const vals = [...recent].reverse(); // oldest → newest
  const max = Math.max(line * 1.4, ...vals.map((v) => v.value ?? 0), 1);
  const linePct = Math.min(100, (line / max) * 100);
  return (
    <div className="l5">
      <div className="l5-plot">
        <div className="l5-line" style={{ bottom: `${linePct}%` }} />
        {vals.map((v, i) => {
          const hit = v.value != null && (side === 'under' ? v.value < line : v.value > line);
          return (
            <div key={i} className="l5-track">
              {v.value == null ? (
                <div className="l5-dnp">DNP</div>
              ) : (
                <div className={`l5-bar ${hit ? 'hit' : 'miss'}`} style={{ height: `${Math.max(4, (v.value / max) * 100)}%` }}>
                  <span>{v.value}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="l5-legend">
        <i /> line {line} · last 5 games, oldest to newest
      </div>
      <div className="l5-labs">
        {vals.map((v, i) => (
          <div key={i} className="l5-lab">
            {v.opp}
          </div>
        ))}
      </div>
    </div>
  );
}
