// Prop markets per league. `keys` are ESPN box-score fields ("group.key" where
// a name repeats across groups, e.g. passing vs. defensive interceptions); multiple keys
// get added together (e.g. points + rebounds + assists).

const HOOPS = [
  { id: 'pts', label: 'Points', keys: ['points'] },
  { id: 'reb', label: 'Rebounds', keys: ['rebounds'] },
  { id: 'ast', label: 'Assists', keys: ['assists'] },
  { id: 'pra', label: 'Pts + Reb + Ast', keys: ['points', 'rebounds', 'assists'] },
  { id: 'pr', label: 'Pts + Reb', keys: ['points', 'rebounds'] },
  { id: 'pa', label: 'Pts + Ast', keys: ['points', 'assists'] },
  { id: '3pm', label: '3-Pointers Made', keys: ['threePointFieldGoalsMade'] },
  { id: 'stl', label: 'Steals', keys: ['steals'] },
  { id: 'blk', label: 'Blocks', keys: ['blocks'] },
];

const FOOTBALL = [
  { id: 'passyds', label: 'Passing Yards', keys: ['passing.passingYards'] },
  { id: 'passtd', label: 'Passing TDs', keys: ['passing.passingTouchdowns'] },
  { id: 'rushyds', label: 'Rushing Yards', keys: ['rushing.rushingYards'] },
  { id: 'recyds', label: 'Receiving Yards', keys: ['receiving.receivingYards'] },
  { id: 'rec', label: 'Receptions', keys: ['receiving.receptions'] },
  { id: 'rushrec', label: 'Rush + Rec Yards', keys: ['rushing.rushingYards', 'receiving.receivingYards'] },
  {
    id: 'anytd',
    label: 'Anytime TD (over 0.5)',
    keys: [
      'rushing.rushingTouchdowns',
      'receiving.receivingTouchdowns',
      'kickReturns.kickReturnTouchdowns',
      'puntReturns.puntReturnTouchdowns',
    ],
  },
  // Graded from the scoring plays (who scored the game's first touchdown), not the box score.
  { id: 'firsttd', label: 'First TD Scorer', keys: [], byPlays: true },
  { id: 'int', label: 'Interceptions Thrown', keys: ['passing.interceptions'] },
];

const BASEBALL = [
  { id: 'h', label: 'Hits', keys: ['batting.hits'] },
  { id: 'hr', label: 'Home Runs', keys: ['batting.homeRuns'] },
  { id: 'rbi', label: 'RBIs', keys: ['batting.RBIs'] },
  { id: 'r', label: 'Runs', keys: ['batting.runs'] },
  { id: 'hrr', label: 'Hits + Runs + RBIs', keys: ['batting.hits', 'batting.runs', 'batting.RBIs'] },
  { id: 'bb', label: 'Walks', keys: ['batting.walks'] },
  { id: 'k', label: 'Pitcher Strikeouts', keys: ['pitching.strikeouts'] },
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
