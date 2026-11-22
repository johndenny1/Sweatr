import { useEffect, useMemo, useState } from 'react';
import { getGames, getRoster, todayISO } from '../lib/api.js';
import { LEAGUE_LIST, leagueById } from '../lib/stats.js';

const LEG_TYPES = [
  { id: 'prop', label: 'Player prop' },
  { id: 'moneyline', label: 'Moneyline' },
  { id: 'spread', label: 'Spread' },
  { id: 'total', label: 'Game total' },
];

export default function LegForm({ onAdd, onCancel }) {
  const [league, setLeague] = useState('nba');
  const [date, setDate] = useState(todayISO());
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState('');
  const [type, setType] = useState('prop');
  const [players, setPlayers] = useState([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [stat, setStat] = useState(leagueById('nba').stats[0].id);
  const [side, setSide] = useState('over');
  const [line, setLine] = useState('');
  const [pick, setPick] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const game = games.find((g) => g.id === gameId);

  // Load the slate when league or date changes
  useEffect(() => {
    setGames([]);
    setGameId('');
    setError('');
    setLoading('games');
    getGames(league, date)
      .then((g) => setGames(g.sort((a, b) => String(a.start).localeCompare(String(b.start)))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(''));
    setStat(leagueById(league).stats[0].id);
  }, [league, date]);

  // Load both rosters once a game is picked
  useEffect(() => {
    setPlayers([]);
    setPlayerId('');
    setPlayerQuery('');
    setPick('');
    if (!game) return;
    setLoading('players');
    Promise.all([getRoster(league, game.awayId), getRoster(league, game.homeId)])
      .then(([a, h]) =>
        setPlayers(
          [...a.map((p) => ({ ...p, team: p.team || game.away })), ...h.map((p) => ({ ...p, team: p.team || game.home }))].sort(
            (x, y) => x.name.localeCompare(y.name)
          )
        )
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(''));
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredPlayers = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    return q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;
  }, [players, playerQuery]);

  const needsLine = type !== 'moneyline';
  const needsPick = type === 'moneyline' || type === 'spread';
  const canAdd =
    game &&
    (!needsLine || line !== '') &&
    (!needsPick || pick) &&
    (type !== 'prop' || playerId);

  function add() {
    const player = players.find((p) => p.id === playerId);
    onAdd({
      id: crypto.randomUUID(),
      league,
      gameId: game.id,
      gameLabel: `${game.away} @ ${game.home}`,
      home: game.home,
      away: game.away,
      homeId: game.homeId,
      awayId: game.awayId,
      date,
      type,
      ...(type === 'prop' && {
        playerId: player.id,
        playerName: player.name,
        team: player.team,
        stat,
        side,
        line: Number(line),
      }),
      ...(type === 'total' && { side, line: Number(line) }),
      ...(type === 'spread' && { pick, line: Number(line) }),
      ...(type === 'moneyline' && { pick }),
    });
  }

  return (
    <div className="card stack">
      <div className="chips">
        {LEAGUE_LIST.map((l) => (
          <button key={l.id} className={`chip ${league === l.id ? 'on' : ''}`} onClick={() => setLeague(l.id)}>
            {l.id.toUpperCase()}
          </button>
        ))}
      </div>

      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <select value={gameId} onChange={(e) => setGameId(e.target.value)} disabled={!games.length}>
        <option value="">
          {loading === 'games' ? 'Loading games…' : games.length ? 'Pick a game' : 'No games on this date'}
        </option>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.away} @ {g.home}
            {g.start ? ` · ${new Date(g.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
          </option>
        ))}
      </select>

      {game && (
        <>
          <div className="chips">
            {LEG_TYPES.map((t) => (
              <button key={t.id} className={`chip ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {type === 'prop' && (
            <>
              <input
                placeholder={loading === 'players' ? 'Loading players…' : 'Search player'}
                value={playerQuery}
                onChange={(e) => setPlayerQuery(e.target.value)}
              />
              <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">Pick a player ({filteredPlayers.length})</option>
                {filteredPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.team} {p.position}
                  </option>
                ))}
              </select>
              <select value={stat} onChange={(e) => setStat(e.target.value)}>
                {leagueById(league).stats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {needsPick && (
            <div className="chips">
              {[game.away, game.home].map((t) => (
                <button key={t} className={`chip ${pick === t ? 'on' : ''}`} onClick={() => setPick(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {(type === 'prop' || type === 'total') && (
            <div className="chips">
              {['over', 'under'].map((s) => (
                <button key={s} className={`chip ${side === s ? 'on' : ''}`} onClick={() => setSide(s)}>
                  {s === 'over' ? 'Over' : 'Under'}
                </button>
              ))}
            </div>
          )}

          {needsLine && (
            <input
              inputMode="decimal"
              placeholder={type === 'spread' ? 'Spread (e.g. -3.5)' : 'Line (e.g. 24.5)'}
              value={line}
              onChange={(e) => setLine(e.target.value.replace(/[^0-9.\-+]/g, ''))}
            />
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      <div className="row gap">
        {onCancel && (
          <button className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="primary grow" disabled={!canAdd} onClick={add}>
          Add leg
        </button>
      </div>
    </div>
  );
}
