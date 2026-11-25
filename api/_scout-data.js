// Gathers the facts behind a Scout report: each team's last 5 games, each player's last 5 stat
// lines vs. their line, injuries, weather and venue. All from ESPN's public feeds.
import { LEAGUES, summaryUrl, normalizeSummary } from './_espn.js';
import { statValue } from '../src/lib/stats.js';
import { describeLeg } from '../src/lib/evaluate.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const scheduleUrl = (league, teamId) => `${BASE}/${LEAGUES[league].path}/teams/${teamId}/schedule`;

// AccuWeather icon codes ESPN uses
const SKY = {
  1: 'Sunny', 2: 'Mostly sunny', 3: 'Partly sunny', 4: 'Intermittent clouds', 5: 'Hazy sun', 6: 'Mostly cloudy', 7: 'Cloudy',
  8: 'Overcast', 11: 'Fog', 12: 'Showers', 13: 'Showers', 14: 'Showers', 15: 'Thunderstorms', 16: 'Thunderstorms',
  17: 'Thunderstorms', 18: 'Rain', 19: 'Flurries', 20: 'Flurries', 21: 'Flurries', 22: 'Snow', 23: 'Snow', 24: 'Ice',
  25: 'Sleet', 26: 'Freezing rain', 29: 'Rain and snow', 30: 'Hot', 31: 'Cold', 32: 'Windy', 33: 'Clear', 34: 'Mostly clear',
  35: 'Partly cloudy', 36: 'Intermittent clouds', 37: 'Hazy', 38: 'Mostly cloudy', 39: 'Showers', 40: 'Showers',
  41: 'Thunderstorms', 42: 'Thunderstorms', 43: 'Flurries', 44: 'Snow',
};

async function getJson(url, cache) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url, { signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(url, p);
  return p;
}

const short = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
};

function gameInfo(summary, leg) {
  const gi = summary?.gameInfo || {};
  const w = gi.weather || null;
  const venue = gi.venue || {};
  const comps = summary?.header?.competitions?.[0]?.competitors || [];
  const record = (abbr) => {
    const c = comps.find((x) => x.team?.abbreviation === abbr);
    const r = (c?.record || []).find((x) => /total|overall/i.test(x.type || x.name || '')) || c?.record?.[0];
    return r?.summary || r?.displayValue || null;
  };
  const injuries = [];
  for (const t of summary?.injuries || []) {
    for (const i of t.injuries || []) {
      if (!/out|doubtful|questionable|injured reserve|day-to-day|suspen|personal|leave|inactive/i.test(`${i.status || ''} ${i.type || ''}`)) continue;
      injuries.push({
        team: t.team?.abbreviation,
        id: String(i.athlete?.id || ''),
        name: i.athlete?.displayName,
        status: i.status,
        detail: i.type || i.details?.type || null,
      });
    }
  }
  return {
    key: `${leg.league}:${leg.gameId}`,
    matchup: `${leg.away} @ ${leg.home}`,
    start: summary?.header?.competitions?.[0]?.date || null,
    venue: venue.fullName || null,
    indoor: venue.indoor === true ? true : venue.indoor === false ? false : null,
    weather: w
      ? {
          temp: w.temperature ?? null,
          sky: w.displayValue || SKY[Number(w.conditionId)] || null,
          gust: w.gust ?? null,
          precip: w.precipitation ?? null,
        }
      : null,
    records: { [leg.home]: record(leg.home), [leg.away]: record(leg.away) },
    injuries,
    // Recent ESPN headlines attached to this game (used only for news that changes availability or role)
    news: (summary?.news?.articles || []).slice(0, 12).map((a) => ({
      headline: String(a.headline || '').slice(0, 200),
      description: String(a.description || '').slice(0, 300),
      published: a.published || null,
      url: a.links?.web?.href || null,
    })).filter((a) => a.headline),
  };
}

// Last 10 finished games for a team: who, where, score (newest first)
async function teamForm(league, teamId, cache) {
  const data = await getJson(scheduleUrl(league, teamId), cache);
  const done = (data?.events || [])
    .filter((e) => e.competitions?.[0]?.status?.type?.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  return done.map((e) => {
    const cs = e.competitions[0].competitors || [];
    const me = cs.find((c) => String(c.team?.id) === String(teamId)) || {};
    const opp = cs.find((c) => c !== me) || {};
    const score = (c) => Number(c.score?.value ?? c.score?.displayValue ?? c.score) || 0;
    return {
      id: String(e.id),
      date: short(e.date),
      at: e.date,
      opp: opp.team?.abbreviation || '?',
      home: me.homeAway === 'home',
      pf: score(me),
      pa: score(opp),
      won: me.winner === true,
    };
  });
}

// What a player's "role" looks like per stat: minutes, targets, carries, attempts, at-bats.
function roleOf(league, stat) {
  if (league === 'nba' || league === 'cbb') return { label: 'minutes', keys: ['minutes'] };
  if (league === 'nfl' || league === 'cfb') {
    if (/^(recyds|rec)$/.test(stat)) return { label: 'targets', keys: ['receiving.receivingTargets'] };
    if (/^(rushyds|rushatt)$/.test(stat)) return { label: 'carries', keys: ['rushing.rushingAttempts'] };
    if (stat === 'rushrec') return { label: 'touches (carries + targets)', keys: ['rushing.rushingAttempts', 'receiving.receivingTargets'] };
    if (/^pass/.test(stat) || stat === 'int') return { label: 'pass attempts', keys: ['passing.passingAttempts'] };
    return null;
  }
  if (league === 'mlb' && stat !== 'k') return { label: 'at-bats', keys: ['batting.atBats'] };
  return null;
}
const sumKeys = (stats, keys) => {
  let v = null;
  for (const k of keys) {
    const short = k.split('.').pop();
    const n = stats?.[k] ?? stats?.[short];
    if (Number.isFinite(n)) v = (v || 0) + n;
  }
  return v;
};
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
// Did this player actually play in that box score?
function played(p, league) {
  if (!p) return false;
  if (league === 'nba' || league === 'cbb') return (p.stats?.minutes || 0) > 0;
  return Object.keys(p.stats || {}).length > 0;
}
// A rough "how much does this guy do" number, for teammates who are out
function production(p, league) {
  const s = p.stats || {};
  if (league === 'nba' || league === 'cbb') return { v: s.points ?? null, label: 'pts' };
  if (league === 'nfl' || league === 'cfb') {
    const yds = (s['passing.passingYards'] || 0) + (s['rushing.rushingYards'] || 0) + (s['receiving.receivingYards'] || 0);
    return { v: yds, label: 'yds' };
  }
  if (league === 'mlb') return { v: (s['batting.hits'] || 0) + (s['batting.runs'] || 0) + (s['batting.RBIs'] || 0), label: 'H+R+RBI' };
  return { v: null, label: '' };
}
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);

export async function gatherScout(legs) {
  const cache = new Map();
  const summaries = new Map();
  const summaryOf = async (league, id) => {
    const k = `${league}:${id}`;
    if (!summaries.has(k)) summaries.set(k, getJson(summaryUrl(league, id), cache));
    return summaries.get(k);
  };

  // Upcoming games
  const gameLegs = [...new Map(legs.map((l) => [`${l.league}:${l.gameId}`, l])).values()];
  const games = await Promise.all(gameLegs.map(async (l) => gameInfo(await summaryOf(l.league, l.gameId), l)));
  const gameByKey = Object.fromEntries(games.map((g) => [g.key, g]));

  // Teams' recent form
  const teamIds = new Map(); // "league:abbr" -> { league, id }
  for (const l of legs) {
    if (l.homeId) teamIds.set(`${l.league}:${l.home}`, { league: l.league, id: l.homeId });
    if (l.awayId) teamIds.set(`${l.league}:${l.away}`, { league: l.league, id: l.awayId });
  }
  const forms = {};
  await Promise.all(
    [...teamIds.entries()].map(async ([k, t]) => {
      forms[k] = await teamForm(t.league, t.id, cache);
    })
  );

  // Players' last 5 box scores (and D/ST TDs)
  const boxOf = async (league, eventId) => {
    const s = await summaryOf(league, eventId);
    return s ? normalizeSummary(s, eventId) : null;
  };

  const out = await Promise.all(
    legs.map(async (leg, i) => {
      const g = gameByKey[`${leg.league}:${leg.gameId}`];
      const base = { i, desc: describeLeg(leg), type: leg.type, side: leg.side || null, line: leg.line ?? null, game: g?.matchup };
      const formOf = (abbr) => forms[`${leg.league}:${abbr}`] || [];

      if (leg.type === 'prop' || leg.type === 'teamprop') {
        const team = leg.type === 'prop' ? leg.team : leg.pick;
        const opp = team === leg.home ? leg.away : leg.home;
        const ten = formOf(team);
        const boxes = await Promise.all(ten.map((r) => boxOf(leg.league, r.id)));
        const all = ten.map((r, k) => {
          const box = boxes[k];
          if (!box) return { date: r.date, opp: r.opp, home: r.home, value: null, box: null };
          if (leg.type === 'teamprop') return { date: r.date, opp: r.opp, home: r.home, value: Number(box.game?.dstTd?.[team]) || 0, box };
          const p = box.players.find((x) => x.id === String(leg.playerId));
          const on = played(p, leg.league);
          return { date: r.date, opp: r.opp, home: r.home, value: on ? statValue(p.stats, leg.league, leg.stat) : null, p: on ? p : null, box };
        });
        const values = all.slice(0, 5).map(({ date, opp: o, value }) => ({ date, opp: o, value }));
        const played5 = values.filter((v) => v.value != null);
        const context = await legContext({ leg, team, opp, all, g, formOf, boxOf });
        const line = Number(leg.line);
        const hits = played5.filter((v) => (leg.side === 'under' ? v.value < line : v.value > line)).length;
        const injury = leg.type === 'prop' ? g?.injuries.find((x) => x.id === String(leg.playerId)) || null : null;
        const last = String(leg.playerName || '').split(' ').slice(-1)[0];
        const news = leg.type === 'prop' && last.length > 2
          ? (g?.news || []).filter((a) => `${a.headline} ${a.description}`.includes(last)).slice(0, 3)
          : [];
        return {
          ...base,
          player: leg.playerName || null,
          team,
          recent: values,
          hits,
          games: played5.length,
          avg: avg(played5.map((v) => v.value)),
          context,
          injury,
          news,
          teamInjuries: (g?.injuries || []).filter((x) => x.team === team && /out|doubtful|reserve/i.test(x.status)).slice(0, 4),
        };
      }

      // Team legs: both sides' recent form
      const side = (abbr) => {
        const f = formOf(abbr).slice(0, 5);
        const n = f.length || 1;
        return {
          team: abbr,
          record: g?.records?.[abbr] || null,
          last5: f.map((r) => `${r.won ? 'W' : 'L'} ${r.pf}-${r.pa} ${r.home ? 'vs' : '@'} ${r.opp}`),
          avgFor: f.length ? Math.round((f.reduce((s, r) => s + r.pf, 0) / n) * 10) / 10 : null,
          avgAgainst: f.length ? Math.round((f.reduce((s, r) => s + r.pa, 0) / n) * 10) / 10 : null,
          out: (g?.injuries || []).filter((x) => x.team === abbr && /out|doubtful|reserve/i.test(x.status)).slice(0, 4),
        };
      };
      const teamCtx = await teamContext({ leg, g, formOf, boxOf });
      return { ...base, pick: leg.pick || null, teams: [side(leg.away), side(leg.home)], context: teamCtx };
    })
  );

  return { games, legs: out };
}


// ---- Right-now factors, as plain sentences built only from real numbers ----

const OUT = /out|doubtful|reserve|suspen|inactive/i;

function restLine(league, abbr, form, start) {
  const last = form[0]?.at;
  if (!last || !start) return null;
  const d = daysBetween(start, last);
  if (d < 0 || d > 20) return null;
  if ((league === 'nba' || league === 'cbb') && d <= 1) return `${abbr} is on a back-to-back (played yesterday)`;
  if (league === 'nfl' && d <= 5) return `${abbr} is on a short week (${d} days since last game)`;
  if (league === 'nfl' && d >= 12) return `${abbr} is coming off a bye/long rest (${d} days)`;
  if ((league === 'nba' || league === 'cbb') && d >= 3) return `${abbr} has had ${d - 1} days of rest`;
  return null;
}

// Teammates who are out today: what they usually produce, and how this player did without them.
function withoutLines(leg, team, all, g) {
  const out = (g?.injuries || []).filter((x) => x.team === team && OUT.test(x.status) && x.id !== String(leg.playerId));
  const lines = [];
  for (const t of out) {
    let theirs = [], label = '';
    const withV = [], withoutV = [];
    for (const r of all) {
      if (!r.box) continue;
      const mate = r.box.players.find((x) => x.id === t.id);
      const mateOn = played(mate, leg.league);
      if (mateOn) {
        const pr = production(mate, leg.league);
        if (pr.v != null) theirs.push(pr.v), (label = pr.label);
      }
      if (r.value != null) (mateOn ? withV : withoutV).push(r.value);
    }
    // Only teammates who've actually been playing (and producing) matter
    if (!theirs.length) continue;
    const a = avg(theirs);
    if (!a) continue;
    let line = `${t.name} is ${String(t.status).toLowerCase()} (averaged ${a} ${label} in ${theirs.length} of the last ${all.length})`;
    if (withoutV.length && withV.length) {
      line += `. ${leg.playerName?.split(' ').slice(-1)[0] || 'He'} averaged ${avg(withoutV)} without him (${withoutV.length} gm) vs ${avg(withV)} with him`;
    } else if (!withoutV.length) {
      line += ', and he’s played every recent game, so his usage is up for grabs';
    }
    lines.push({ a, line });
  }
  return lines.sort((x, y) => y.a - x.a).slice(0, 3).map((x) => x.line);
}

async function legContext({ leg, team, opp, all, g, formOf, boxOf }) {
  const ctx = [];
  const line = Number(leg.line);
  if (leg.type === 'prop') {
    ctx.push(...withoutLines(leg, team, all, g));

    // Role trend: last 3 vs the 7 before
    const role = roleOf(leg.league, leg.stat);
    if (role) {
      const rv = all.map((r) => (r.p ? sumKeys(r.p.stats, role.keys) : null)).filter((v) => v != null);
      if (rv.length >= 4) {
        const recent = avg(rv.slice(0, 3)), before = avg(rv.slice(3));
        const diff = recent - before;
        const big = Math.abs(diff) >= Math.max(2, before * 0.15);
        ctx.push(
          big
            ? `Role ${diff > 0 ? 'growing' : 'shrinking'}: ${recent} ${role.label} a game over his last 3, ${diff > 0 ? 'up' : 'down'} from ${before}`
            : `Steady role: about ${recent} ${role.label} a game lately`
        );
      }
    }

    // Last 10 and home/away
    const p10 = all.filter((r) => r.value != null);
    if (p10.length >= 6 && Number.isFinite(line)) {
      const h = p10.filter((r) => (leg.side === 'under' ? r.value < line : r.value > line)).length;
      ctx.push(`Cleared it in ${h} of his last ${p10.length}, averaging ${avg(p10.map((r) => r.value))}`);
    }
    const isHome = team === leg.home;
    const here = p10.filter((r) => r.home === isHome);
    const there = p10.filter((r) => r.home !== isHome);
    if (here.length >= 2 && there.length >= 2) {
      const a = avg(here.map((r) => r.value)), b = avg(there.map((r) => r.value));
      if (Math.abs(a - b) >= Math.max(1, Math.abs(b) * 0.15)) ctx.push(`Averages ${a} ${isHome ? 'at home' : 'on the road'} vs ${b} ${isHome ? 'on the road' : 'at home'} (today he’s ${isHome ? 'home' : 'away'})`);
    }

    // What the opponent has been giving up in this stat (whole team total), last 5
    const of = formOf(opp).slice(0, 5);
    if (of.length >= 3) {
      const oppBoxes = await Promise.all(of.map((r) => boxOf(leg.league, r.id)));
      const allowed = [];
      oppBoxes.forEach((b, k) => {
        if (!b) return;
        const facing = b.players.filter((x) => x.team && x.team !== opp && played(x, leg.league));
        if (!facing.length) return;
        allowed.push(facing.reduce((sum, x) => sum + (statValue(x.stats, leg.league, leg.stat) || 0), 0));
      });
      const label = describeLeg({ ...leg, side: 'over', line: '' }).replace(leg.playerName || '', '').replace(/over/i, '').trim();
      if (allowed.length >= 3 && leg.stat !== 'firsttd' && leg.stat !== 'anytd') ctx.push(`${opp} has allowed ${avg(allowed)} ${label.toLowerCase()} per game (team total) over its last ${allowed.length}`);
    }
  }
  const rest = [restLine(leg.league, team, formOf(team), g?.start), restLine(leg.league, opp, formOf(opp), g?.start)].filter(Boolean);
  ctx.push(...rest);
  return ctx.slice(0, 7);
}

async function teamContext({ leg, g, formOf, boxOf }) {
  const ctx = [];
  for (const abbr of [leg.away, leg.home]) {
    const ten = formOf(abbr).slice(0, 5);
    const boxes = await Promise.all(ten.map((r) => boxOf(leg.league, r.id)));
    const all = ten.map((r, k) => ({ box: boxes[k], value: null }));
    const lines = withoutLines({ ...leg, playerId: '' }, abbr, all, g).map((l) => l.replace(/\. .*$/, '').replace(/, and he’s.*$/, ''));
    if (lines.length) ctx.push(`${abbr} missing: ${lines.join('; ')}`);
    const r = restLine(leg.league, abbr, formOf(abbr), g?.start);
    if (r) ctx.push(r);
  }
  return ctx.slice(0, 6);
}
