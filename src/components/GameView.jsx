import { useCallback, useEffect, useState } from 'react';
import { getGameDetail } from '../lib/api.js';
import { evaluateLeg, describeLeg } from '../lib/evaluate.js';

const STATUS_TEXT = { pending: 'Not started', live: 'Live', won: 'Hit', lost: 'Miss', push: 'Push' };

function periodTag(play, league) {
  if (play.periodLabel && league === 'mlb') return play.periodLabel.replace(' Inning', '');
  if (!play.period) return '';
  if (league === 'cbb') return play.period > 2 ? `OT${play.period - 2 > 1 ? play.period - 2 : ''}` : `H${play.period}`;
  if (league === 'mlb') return `Inn ${play.period}`;
  return play.period > 4 ? `OT${play.period - 4 > 1 ? play.period - 4 : ''}` : `Q${play.period}`;
}

function TeamBlock({ team, hasBall, alignRight }) {
  if (!team) return <div />;
  return (
    <div className={`team-block ${alignRight ? 'right' : ''}`}>
      {team.logo ? <img src={team.logo} alt="" className="logo-img" /> : <div className="logo-img placeholder">{team.abbr}</div>}
      <div className="team-abbr">
        {hasBall && !alignRight && <span className="ball">●</span>}
        {team.abbr}
        {hasBall && alignRight && <span className="ball">●</span>}
      </div>
      {team.record && <div className="muted small">{team.record}</div>}
    </div>
  );
}

function Diamond({ s }) {
  return (
    <div className="diamond">
      <span className={`base b2 ${s.onSecond ? 'on' : ''}`} />
      <span className={`base b3 ${s.onThird ? 'on' : ''}`} />
      <span className={`base b1 ${s.onFirst ? 'on' : ''}`} />
    </div>
  );
}

function Situation({ detail, league }) {
  const s = detail.situation;
  if (!s) return null;
  const football = league === 'nfl' || league === 'cfb';
  const baseball = league === 'mlb';
  const ballTeam = [detail.home, detail.away].find((t) => t && t.id === s.possessionTeamId);

  return (
    <div className={`card stack situation ${s.redZone ? 'redzone' : ''}`}>
      {football && (
        <>
          <div className="row between">
            <div className="label">{ballTeam ? `${ballTeam.abbr} ball` : 'Live'}</div>
            {s.redZone && <span className="pill status-lost">Red zone</span>}
          </div>
          {s.downDistance && <div className="big-situation">{s.downDistance}</div>}
          {(s.homeTimeouts != null || s.awayTimeouts != null) && (
            <div className="muted small">
              Timeouts · {detail.away?.abbr} {s.awayTimeouts ?? '–'} · {detail.home?.abbr} {s.homeTimeouts ?? '–'}
            </div>
          )}
        </>
      )}
      {baseball && (
        <div className="row between">
          <Diamond s={s} />
          <div className="right">
            {s.balls != null && (
              <div className="big-situation">
                {s.balls}-{s.strikes}
              </div>
            )}
            {s.outs != null && (
              <div className="outs">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`out ${i < s.outs ? 'on' : ''}`} />
                ))}
                <span className="muted small"> {s.outs} out{s.outs === 1 ? '' : 's'}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {baseball && (s.batter || s.pitcher) && (
        <div className="small">
          {s.batter && (
            <div>
              <span className="label">AB</span> {s.batter}
            </div>
          )}
          {s.pitcher && (
            <div>
              <span className="label">P</span> {s.pitcher}
            </div>
          )}
        </div>
      )}
      {s.lastPlay && (
        <div className="small">
          <span className="label">Last play</span> {s.lastPlay}
        </div>
      )}
    </div>
  );
}

function Linescore({ detail }) {
  const { home, away } = detail;
  if (!home?.linescore?.length && !away?.linescore?.length) return null;
  const n = Math.max(home?.linescore?.length || 0, away?.linescore?.length || 0);
  const cols = Array.from({ length: n }, (_, i) => i + 1);
  return (
    <div className="card linescore-wrap">
      <table className="linescore">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th>T</th>
          </tr>
        </thead>
        <tbody>
          {[away, home].map((t) =>
            t ? (
              <tr key={t.id}>
                <td className="team-cell">{t.abbr}</td>
                {cols.map((c) => (
                  <td key={c}>{t.linescore[c - 1] ?? ''}</td>
                ))}
                <td className="total">{t.score ?? ''}</td>
              </tr>
            ) : null
          )}
        </tbody>
      </table>
    </div>
  );
}

function BoxScore({ detail, legs }) {
  const teams = detail.boxscore || [];
  const mine = new Set(legs.filter((l) => l.type === 'prop').map((l) => String(l.playerId)));
  // Open on the team of the first player in your parlay, else the away team.
  const firstMine = teams.find((t) => t.groups.some((g) => g.rows.some((r) => mine.has(r.id))));
  const [teamId, setTeamId] = useState(firstMine?.teamId || detail.away?.id || teams[0]?.teamId);
  const team = teams.find((t) => t.teamId === teamId) || teams[0];

  if (!teams.length) return <div className="card"><p className="muted small center">Box score shows up once the game starts.</p></div>;

  return (
    <div className="stack">
      <div className="chips">
        {[detail.away, detail.home].filter(Boolean).map((t) => (
          <button key={t.id} className={`chip ${team?.teamId === t.id ? 'on' : ''}`} onClick={() => setTeamId(t.id)}>
            {t.logo && <img src={t.logo} alt="" className="chip-logo" />}
            {t.abbr}
          </button>
        ))}
      </div>
      {team?.groups.map((g) => {
        const played = g.rows.filter((r) => !r.dnp);
        const dnp = g.rows.filter((r) => r.dnp);
        return (
          <div key={g.title} className="card box-card">
            <div className="label box-title">{g.title}</div>
            <div className="box-scroll">
              <table className="box-table">
                <thead>
                  <tr>
                    <th className="sticky-col">Player</th>
                    {g.labels.map((l, i) => (
                      <th key={i}>{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {played.map((r) => (
                    <tr key={r.id} className={mine.has(r.id) ? 'mine' : ''}>
                      <td className="sticky-col">
                        <span className="box-name">{r.name}</span>
                        <span className="box-pos">{r.pos}</span>
                      </td>
                      {g.labels.map((_, i) => (
                        <td key={i}>{r.stats[i] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                  {g.totals && (
                    <tr className="totals">
                      <td className="sticky-col">Team</td>
                      {g.labels.map((_, i) => (
                        <td key={i}>{g.totals[i] ?? ''}</td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {dnp.length > 0 && (
              <div className="muted small dnp">
                Did not play: {dnp.map((r) => r.name + (r.reason ? ` (${r.reason.toLowerCase()})` : '')).join(', ')}
              </div>
            )}
          </div>
        );
      })}
      {mine.size > 0 && <p className="muted small center">Players in your parlay are highlighted.</p>}
    </div>
  );
}

export default function GameView({ league, gameId, date, legs = [], onBack }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('plays');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await getGameDetail(league, gameId, date);
      setDetail(d);
      setError('');
      setUpdated(new Date());
    } catch (e) {
      setError(e.message);
    }
  }, [league, gameId, date]);

  const isFinal = detail?.game?.isFinal;
  const isLive = detail?.game?.isLive;

  useEffect(() => {
    load();
    if (isFinal) return;
    const t = setInterval(load, isLive ? 10_000 : 60_000);
    return () => clearInterval(t);
  }, [load, isFinal, isLive]);

  if (!detail) return <p className="muted">{error || 'Loading game…'}</p>;

  const { game, home, away } = detail;
  const hasBall = (t) => t && detail.situation?.possessionTeamId === t.id;
  const teamAbbr = (id) => [home, away].find((t) => t?.id === id)?.abbr;

  const centerLine = game?.isLive || game?.isFinal
    ? game.detail
    : game?.start
      ? new Date(game.start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : game?.status;

  return (
    <div className="stack">
      <button className="back-btn" onClick={onBack}>
        <svg className="back-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        <span>Back to parlay</span>
      </button>

      <div className="card scorebug">
        <TeamBlock team={away} hasBall={hasBall(away)} />
        <div className="score-center">
          <div className="scores">
            <span>{away?.score ?? '–'}</span>
            <span className="muted dash">–</span>
            <span>{home?.score ?? '–'}</span>
          </div>
          <div className={`small ${game?.isLive ? 'live' : 'muted'}`}>
            {game?.isLive && <span className="dot" />}
            {centerLine}
          </div>
          {detail.broadcast && <div className="muted small">{detail.broadcast}</div>}
        </div>
        <TeamBlock team={home} hasBall={hasBall(home)} alignRight />
      </div>

      <Situation detail={detail} league={league} />
      <Linescore detail={detail} />

      {legs.length > 0 && (
        <div className="card stack">
          <div className="label">Your legs</div>
          {legs.map((leg) => {
            const r = evaluateLeg(leg, game, detail.players);
            return (
              <div key={leg.id} className={`leg status-${r.status}`}>
                <div className="row between">
                  <div>{describeLeg(leg)}</div>
                  <span className={`pill status-${r.status}`}>{STATUS_TEXT[r.status]}</span>
                </div>
                {r.progress !== undefined && (
                  <div className="bar">
                    <div style={{ width: `${Math.round(r.progress * 100)}%` }} />
                  </div>
                )}
                <div className="muted small">
                  {r.summary}
                  {r.need ? ` · needs ${r.need} more` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="chips scroll-x">
        <button className={`chip ${tab === 'plays' ? 'on' : ''}`} onClick={() => setTab('plays')}>
          Plays
        </button>
        <button className={`chip ${tab === 'box' ? 'on' : ''}`} onClick={() => setTab('box')}>
          Box score
        </button>
        <button className={`chip ${tab === 'stats' ? 'on' : ''}`} onClick={() => setTab('stats')}>
          Team stats
        </button>
      </div>

      {tab === 'box' && <BoxScore detail={detail} legs={legs} />}

      {tab === 'plays' && (
        <div className="card plays">
          {detail.plays.length === 0 && <p className="muted small center">No plays yet.</p>}
          {detail.plays.map((p) => (
            <div key={p.id} className={`play ${p.scoring ? 'scoring' : ''}`}>
              <div className="play-meta">
                <span className="tag">{periodTag(p, league)}</span>
                {p.clock && <span>{p.clock}</span>}
                {teamAbbr(p.teamId) && <span className="play-team">{teamAbbr(p.teamId)}</span>}
                {p.down && <span className="muted">{p.down}</span>}
              </div>
              <div className="play-text">{p.text}</div>
              {p.scoring && p.awayScore != null && (
                <div className="play-score">
                  {away?.abbr} {p.awayScore} – {home?.abbr} {p.homeScore}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'stats' && (
        <div className="card">
          {detail.teamStats.length < 2 ? (
            <p className="muted small center">Team stats show up once the game starts.</p>
          ) : (
            <table className="team-stats">
              <thead>
                <tr>
                  <th>{detail.teamStats[0].abbr}</th>
                  <th />
                  <th>{detail.teamStats[1].abbr}</th>
                </tr>
              </thead>
              <tbody>
                {detail.teamStats[0].stats.map((s) => {
                  const other = detail.teamStats[1].stats.find((x) => x.key === s.key);
                  return (
                    <tr key={s.key}>
                      <td>{s.value}</td>
                      <td className="muted small">{s.label}</td>
                      <td>{other?.value ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <p className="muted small center">
        {isFinal ? 'Final' : `Updates every ${isLive ? 10 : 60}s`}
        {updated ? ` · ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}
      </p>
    </div>
  );
}
