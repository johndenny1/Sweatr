import { supabase } from './supabase.js';
import { getGames, getRoster, todayISO } from './api.js';
import { leagueById } from './stats.js';

// ---------- 1. Shrink the screenshot so it uploads fast and fits Vercel's limit ----------

export function imageToBase64(file, maxSide = 1600, quality = 0.85) {
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

export async function readSlip(file) {
  const image = await imageToBase64(file);
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data?.session?.access_token || ''}`,
    },
    body: JSON.stringify({ image, today: todayISO() }),
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

  const matched = [];
  const unmatched = [];

  for (const raw of rawLegs) {
    const league = String(raw.league || '').toLowerCase();
    const label = raw.raw || [raw.player, raw.team, raw.stat, raw.line].filter(Boolean).join(' ');
    if (!leagueById(league)) {
      unmatched.push({ label, reason: 'Unknown league' });
      continue;
    }

    // Find the game: slip date if given, otherwise today and the next week.
    const start = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : todayISO();
    const span = raw.date ? 1 : 8;
    let game = null;
    let date = start;
    for (let i = 0; i < span && !game; i++) {
      date = addDays(start, i);
      const slate = await games(league, date);
      game =
        slate.find((g) => [g.home, g.away].some((t) => sameTeam(t, raw.team)) &&
          (!raw.opponent || [g.home, g.away].some((t) => sameTeam(t, raw.opponent)))) ||
        slate.find((g) => [g.home, g.away].some((t) => sameTeam(t, raw.team) || sameTeam(t, raw.opponent))) ||
        null;
    }
    if (!game) {
      unmatched.push({ label, reason: "Couldn't find the game" });
      continue;
    }

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
      if (!stat) {
        unmatched.push({ label, reason: 'Prop type not supported yet' });
        continue;
      }
      const players = [
        ...(await roster(league, game.awayId)).map((p) => ({ ...p, team: p.team || game.away })),
        ...(await roster(league, game.homeId)).map((p) => ({ ...p, team: p.team || game.home })),
      ];
      const player = players.find((p) => sameName(p.name, raw.player));
      if (!player) {
        unmatched.push({ label, reason: `Couldn't find ${raw.player || 'the player'}` });
        continue;
      }
      matched.push({
        ...base,
        type: 'prop',
        playerId: player.id,
        playerName: player.name,
        team: player.team,
        stat: stat.id,
        side,
        line: Number.isFinite(line) ? line : 0.5,
      });
    } else if (raw.type === 'total' && Number.isFinite(line)) {
      matched.push({ ...base, type: 'total', side, line });
    } else if (raw.type === 'spread' && pickTeam && Number.isFinite(line)) {
      matched.push({ ...base, type: 'spread', pick: pickTeam, line });
    } else if (raw.type === 'moneyline' && pickTeam) {
      matched.push({ ...base, type: 'moneyline', pick: pickTeam });
    } else {
      unmatched.push({ label, reason: 'Missing team or line' });
    }
  }

  return { matched, unmatched };
}
