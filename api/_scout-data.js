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

// Last 5 finished games for a team: who, where, score
async function teamForm(league, teamId, cache) {
  const data = await getJson(scheduleUrl(league, teamId), cache);
  const done = (data?.events || [])
    .filter((e) => e.competitions?.[0]?.status?.type?.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  return done.map((e) => {
    const cs = e.competitions[0].competitors || [];
    const me = cs.find((c) => String(c.team?.id) === String(teamId)) || {};
    const opp = cs.find((c) => c !== me) || {};
    const score = (c) => Number(c.score?.value ?? c.score?.displayValue ?? c.score) || 0;
    return {
      id: String(e.id),
      date: short(e.date),
      opp: opp.team?.abbreviation || '?',
      home: me.homeAway === 'home',
      pf: score(me),
      pa: score(opp),
      won: me.winner === true,
    };
  });
}

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
        const recent = formOf(team);
        const values = await Promise.all(
          recent.map(async (r) => {
            const box = await boxOf(leg.league, r.id);
            if (!box) return { date: r.date, opp: r.opp, value: null };
            if (leg.type === 'teamprop') return { date: r.date, opp: r.opp, value: Number(box.game?.dstTd?.[team]) || 0 };
            const p = box.players.find((x) => x.id === String(leg.playerId));
            return { date: r.date, opp: r.opp, value: p ? statValue(p.stats, leg.league, leg.stat) : null };
          })
        );
        const played = values.filter((v) => v.value != null);
        const line = Number(leg.line);
        const hits = played.filter((v) => (leg.side === 'under' ? v.value < line : v.value > line)).length;
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
          games: played.length,
          avg: played.length ? Math.round((played.reduce((s, v) => s + v.value, 0) / played.length) * 10) / 10 : null,
          injury,
          news,
          teamInjuries: (g?.injuries || []).filter((x) => x.team === team && /out|doubtful|reserve/i.test(x.status)).slice(0, 4),
        };
      }

      // Team legs: both sides' recent form
      const side = (abbr) => {
        const f = formOf(abbr);
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
      return { ...base, pick: leg.pick || null, teams: [side(leg.away), side(leg.home)] };
    })
  );

  return { games, legs: out };
}
