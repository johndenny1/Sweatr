// Team props that aren't about one player. Right now: defense / special teams (D/ST) touchdowns,
// e.g. "CIN Bengals D/ST: 1+ touchdowns" (Yes = over 0.5, No = under 0.5).
// Shared by the browser and the server, so keep it dependency-free.

const DST = /\b(d\s*\/\s*st|dst|defen[cs]e(\s*(\/|and|&)\s*special teams)?|special teams)\b/i;

export const isDstText = (s) => DST.test(String(s || ''));

// Turn whatever the AI read into the app's team-prop shape, if it is one.
export function normalizeTeamProp(leg) {
  const text = [leg.player, leg.raw, leg.stat].filter(Boolean).join(' ');
  const already = String(leg.type || '').toLowerCase() === 'teamprop';
  if (!already && !(isDstText(text) && /touch\s*down|\btd/i.test(text))) return leg;
  // "CIN Bengals D/ST" → team "CIN" when the slip doesn't list the team separately
  const words = String(leg.player || leg.raw || '')
    .replace(/[·•:|,-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(yes|no)$/i.test(w));
  const team = leg.team || words[0] || null;
  const line = Number(leg.line);
  return { ...leg, type: 'teamprop', stat: 'dsttd', team, player: null, line: Number.isFinite(line) ? line : 0.5 };
}

export const TEAM_STATS = { dsttd: { label: 'D/ST TDs' } };
