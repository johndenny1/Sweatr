// Prop markets per league. `keys` are SportsDataIO field names; multiple keys
// get added together (e.g. points + rebounds + assists).

const HOOPS = [
  { id: 'pts', label: 'Points', keys: ['Points'] },
  { id: 'reb', label: 'Rebounds', keys: ['Rebounds'] },
  { id: 'ast', label: 'Assists', keys: ['Assists'] },
  { id: 'pra', label: 'Pts + Reb + Ast', keys: ['Points', 'Rebounds', 'Assists'] },
  { id: 'pr', label: 'Pts + Reb', keys: ['Points', 'Rebounds'] },
  { id: 'pa', label: 'Pts + Ast', keys: ['Points', 'Assists'] },
  { id: '3pm', label: '3-Pointers Made', keys: ['ThreePointersMade'] },
  { id: 'stl', label: 'Steals', keys: ['Steals'] },
  { id: 'blk', label: 'Blocks', keys: ['BlockedShots'] },
];

const FOOTBALL = [
  { id: 'passyds', label: 'Passing Yards', keys: ['PassingYards'] },
  { id: 'passtd', label: 'Passing TDs', keys: ['PassingTouchdowns'] },
  { id: 'rushyds', label: 'Rushing Yards', keys: ['RushingYards'] },
  { id: 'recyds', label: 'Receiving Yards', keys: ['ReceivingYards'] },
  { id: 'rec', label: 'Receptions', keys: ['Receptions'] },
  { id: 'rushrec', label: 'Rush + Rec Yards', keys: ['RushingYards', 'ReceivingYards'] },
  { id: 'anytd', label: 'Anytime TD (over 0.5)', keys: ['RushingTouchdowns', 'ReceivingTouchdowns'] },
  { id: 'int', label: 'Interceptions Thrown', keys: ['PassingInterceptions'] },
];

const BASEBALL = [
  { id: 'h', label: 'Hits', keys: ['Hits'] },
  { id: 'hr', label: 'Home Runs', keys: ['HomeRuns'] },
  { id: 'rbi', label: 'RBIs', keys: ['RunsBattedIn'] },
  { id: 'r', label: 'Runs', keys: ['Runs'] },
  { id: 'hrr', label: 'Hits + Runs + RBIs', keys: ['Hits', 'Runs', 'RunsBattedIn'] },
  { id: 'tb', label: 'Total Bases', keys: ['TotalBases'] },
  { id: 'sb', label: 'Stolen Bases', keys: ['StolenBases'] },
  { id: 'k', label: 'Pitcher Strikeouts', keys: ['PitchingStrikeouts'] },
];

export const LEAGUE_LIST = [
  { id: 'nfl', label: 'NFL', stats: FOOTBALL },
  { id: 'nba', label: 'NBA', stats: HOOPS },
  { id: 'mlb', label: 'MLB', stats: BASEBALL },
  { id: 'cfb', label: 'College Football', stats: FOOTBALL },
  { id: 'cbb', label: 'College Basketball', stats: HOOPS },
];

export const leagueById = (id) => LEAGUE_LIST.find((l) => l.id === id);
export const statDef = (league, statId) => leagueById(league)?.stats.find((s) => s.id === statId);

export function statValue(stats, league, statId) {
  const def = statDef(league, statId);
  if (!def || !stats) return 0;
  const total = def.keys.reduce((sum, k) => sum + (Number(stats[k]) || 0), 0);
  return Math.round(total * 10) / 10;
}
