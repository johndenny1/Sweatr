import { supabase } from './supabase.js';
import { getGames, getRoster, todayISO } from './api.js';
import { leagueById } from './stats.js';

// ---------- 1. Shrink the screenshot so it uploads fast and fits Vercel's limit ----------

export function imageToBase64(file, maxSide = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't open that image"));
    };
    img.src = url;
  });
}

// ---------- 2. Ask the server (Claude) to read the slip ----------

export const MAX_SHOTS = 4;

// One file or several screenshots of the same (long) slip. Overlapping legs are merged on the server.
export async function readSlip(fileOrFiles) {
  const files = (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]).slice(0, MAX_SHOTS);
  // Several tall screenshots: keep each a bit smaller so the upload stays fast
  const images = await Promise.all(files.map((f) => imageToBase64(f, files.length > 1 ? 1600 : 1280, files.length > 2 ? 0.72 : 0.8)));
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data?.session?.access_token || ''}`,
    },
    body: JSON.stringify({ images, today: todayISO() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Scan failed (${res.status})`);
  return body;
}

// ---------- 3. Match what Claude read to real games and players ----------

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Sportsbooks and ESPN don't always agree on abbreviations.
const TEAM_ALIASES = [
  ['gs', 'gsw'], ['ny', 'nyk'], ['sa', 'sas'], ['no', 'nop', 'nor'], ['pho', 'phx'],
  ['uta', 'utah', 'uth'], ['was', 'wsh', 'wash'], ['bkn', 'bk', 'brk'], ['cha', 'cho'],
  ['jax', 'jac'], ['lar', 'la'], ['lv', 'lvr', 'oak'], ['kc', 'kan'], ['tb', 'tam'],
  ['chw', 'cws'], ['sd', 'sdp'], ['sf', 'sfg'], ['ath', 'oak'],
];
function sameTeam(a, b) {
  const x = norm(a).replace(/ /g, '');
  const y = norm(b).replace(/ /g, '');
  if (!x || !y) return false;
  if (x === y) return true;
  return TEAM_ALIASES.some((g) => g.includes(x) && g.includes(y));
}

function sameName(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [xf, ...xr] = x.split(' ');
  const [yf, ...yr] = y.split(' ');
  // Same last name + same first initial ("J. Tatum" vs "Jayson Tatum")
  return xr.join(' ') === yr.join(' ') && xf[0] === yf[0];
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function resolveLegs(rawLegs) {
  const gameCache = {};
  const rosterCache = {};
  const games = (league, date) => (gameCache[`${league}:${date}`] ??= getGames(league, date).catch(() => []));
  const roster = (league, team) => (rosterCache[`${league}:${team}`] ??= getRoster(league, team).catch(() => []));

  // How many of a game's two teams are named in a matchup line like "MIL Bucks vs TOR Raptors".
  function matchupHits(g, matchup) {
    if (!matchup) return 0;
    const parts = String(matchup).split(/\s+(?:vs\.?|v\.?|@|at)\s+/i);
    const sideHit = (abbr, names) => parts.some((p) => sameTeam(abbr, p.split(/\s+/)[0]) || names.some((n) => norm(p).includes(norm(n)) || norm(n).includes(norm(p))));
    return (sideHit(g.home, g.homeNames || []) ? 1 : 0) + (sideHit(g.away, g.awayNames || []) ? 1 : 0);
  }

  // Look for a player in the preferred games first, then every game on each candidate date.
  async function findPlayer(league, name, preferred, slates, dates) {
    const search = async (gamesList, date) => {
      const rosters = await Promise.all(
        gamesList.map(async (g) => {
          const [a, h] = await Promise.all([roster(league, g.awayId), roster(league, g.homeId)]);
          return { g, players: [...a.map((p) => ({ ...p, team: p.team || g.away })), ...h.map((p) => ({ ...p, team: p.team || g.home }))] };
        })
      );
      for (const r of rosters) {
        const player = r.players.find((p) => sameName(p.name, name));
        if (player) return { game: r.g, player, date };
      }
      return null;
    };
    for (const g of preferred) {
      const i = slates.findIndex((sl) => sl.includes(g));
      const hit = await search([g], dates[Math.max(i, 0)]);
      if (hit) return hit;
    }
    for (let i = 0; i < slates.length; i++) {
      if (!slates[i].length) continue;
      const hit = await search(slates[i], dates[i]);
      if (hit) return hit;
    }
    return null;
  }

  // Every leg is matched at the same time, and each leg checks all candidate dates at once.
  const results = await Promise.all(rawLegs.map((raw) => matchOne(raw)));
  const matched = results.filter((r) => r.leg).map((r) => r.leg);
  const unmatched = results.filter((r) => r.miss).map((r) => r.miss);

  async function matchOne(rawIn) {
    let raw = rawIn;
    const league = String(raw.league || '').toLowerCase();
    const label = raw.raw || [raw.player, raw.team, raw.stat, raw.line].filter(Boolean).join(' ');
    if (!leagueById(league)) return { miss: { label, reason: 'Unknown league' } };

    const start = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : todayISO();
    const dates = Array.from({ length: raw.date ? 1 : 8 }, (_, i) => addDays(start, i));
    const slates = await Promise.all(dates.map((d) => games(league, d)));
    let game = null;
    let date = start;
    for (let i = 0; i < dates.length && !game; i++) {
      const slate = slates[i];
      game =
        slate.find((g) => matchupHits(g, raw.matchup) === 2) ||
        slate.find((g) => [g.home, g.away].some((t) => sameTeam(t, raw.team)) &&
          (!raw.opponent || [g.home, g.away].some((t) => sameTeam(t, raw.opponent)))) ||
        slate.find((g) => matchupHits(g, raw.matchup) === 1) ||
        slate.find((g) => [g.home, g.away].some((t) => sameTeam(t, raw.team) || sameTeam(t, raw.opponent))) ||
        null;
      if (game) date = dates[i];
    }

    // Props: find the player in that game, or anywhere on the slate (teams on slips can be missing or wrong).
    if (raw.type === 'prop') {
      const found = await findPlayer(league, raw.player, game ? [game] : [], slates, dates);
      if (found) {
        game = found.game;
        date = found.date;
        raw = { ...raw, _player: found.player };
      } else if (!game) {
        return { miss: { label, reason: `Couldn't find ${raw.player || 'the player'} in any game` } };
      }
    }
    if (!game) return { miss: { label, reason: "Couldn't find the game" } };

    const base = {
      id: crypto.randomUUID(),
      league,
      gameId: game.id,
      gameLabel: `${game.away} @ ${game.home}`,
      home: game.home,
      away: game.away,
      homeId: game.homeId,
      awayId: game.awayId,
      date,
    };
    const line = Number(raw.line);
    const side = raw.side === 'under' ? 'under' : 'over';
    const pickTeam = [game.home, game.away].find((t) => sameTeam(t, raw.team));

    if (raw.type === 'prop') {
      const stat = leagueById(league).stats.find((s) => s.id === raw.stat);
      if (!stat) return { miss: { label, reason: 'Prop type not supported yet' } };
      const player = raw._player;
      if (!player) return { miss: { label, reason: `Couldn't find ${raw.player || 'the player'}` } };
      return {
        leg: {
          ...base,
          type: 'prop',
          playerId: player.id,
          playerName: player.name,
          team: player.team,
          stat: stat.id,
          side,
          line: Number.isFinite(line) ? line : 0.5,
        },
      };
    }
    if (raw.type === 'total' && Number.isFinite(line)) return { leg: { ...base, type: 'total', side, line } };
    if (raw.type === 'spread' && pickTeam && Number.isFinite(line)) return { leg: { ...base, type: 'spread', pick: pickTeam, line } };
    if (raw.type === 'moneyline' && pickTeam) return { leg: { ...base, type: 'moneyline', pick: pickTeam } };
    return { miss: { label, reason: 'Missing team or line' } };
  }

  return { matched, unmatched };
}
