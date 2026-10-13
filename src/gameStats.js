/* ---------------------------------------------------------
   Profile stats and achievements, computed from the account's
   game_results rows. Nothing here is stored — everything is
   derived fresh, so adding or retuning an achievement applies
   to past games too.
--------------------------------------------------------- */

const GUESS_GAMES = ["dailyGame", "dailyWinner"];
const FACEOFF_GAMES = ["faceoff", "nominationsFaceoff"];

// "YYYY-MM-DD" -> whole days, for streak math
const dayNumber = (date) => Math.round(Date.UTC(...date.split("-").map((n, i) => (i === 1 ? n - 1 : +n))) / 86400000);

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
const pct = (part, whole) => (whole ? part / whole : null);

function guessGameStats(rows) {
  const wins = rows.filter((r) => r.won);
  const timed = rows.filter((r) => Number.isFinite(r.active_seconds));
  const distribution = [1, 2, 3, 4, 5].map((n) => wins.filter((r) => r.guesses === n).length);
  return {
    played: rows.length,
    wins: wins.length,
    winRate: pct(wins.length, rows.length),
    avgGuesses: avg(wins.map((r) => r.guesses)),
    noHintWins: wins.filter((r) => !r.hint_used).length,
    avgSeconds: avg(timed.map((r) => r.active_seconds)),
    fastestSeconds: wins.some((r) => Number.isFinite(r.active_seconds))
      ? Math.min(...wins.filter((r) => Number.isFinite(r.active_seconds)).map((r) => r.active_seconds))
      : null,
    distribution,
    losses: rows.length - wins.length,
  };
}

function faceoffStats(rows) {
  const correct = rows.reduce((n, r) => n + r.rounds_correct, 0);
  const rounds = rows.reduce((n, r) => n + r.rounds_total, 0);
  return {
    played: rows.length,
    roundsCorrect: correct,
    rounds,
    accuracy: pct(correct, rounds),
    perfectGames: rows.filter((r) => r.rounds_correct === r.rounds_total).length,
  };
}

// Current streak counts back from today, or from yesterday when today's games
// haven't been played yet (the streak isn't broken until a whole day passes).
export function streaks(dates, today) {
  const days = [...new Set(dates.map(dayNumber))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const played = new Set(days);
  const t = dayNumber(today);
  let cursor = played.has(t) ? t : played.has(t - 1) ? t - 1 : null;
  let current = 0;
  while (cursor !== null && played.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, best, playedToday: played.has(t) };
}

export function computeStats(rows, today) {
  const byGame = (game) => rows.filter((r) => r.game === game);
  const guessRows = rows.filter((r) => GUESS_GAMES.includes(r.game));
  const guessWins = guessRows.filter((r) => r.won).length;
  const games = Object.fromEntries([
    ...GUESS_GAMES.map((g) => [g, guessGameStats(byGame(g))]),
    ...FACEOFF_GAMES.map((g) => [g, faceoffStats(byGame(g))]),
  ]);
  const gamesPerDay = {};
  for (const r of rows) gamesPerDay[r.puzzle_date] = (gamesPerDay[r.puzzle_date] || 0) + 1;
  return {
    totalGames: rows.length,
    // win rate only applies to the guessing games; Faceoff tracks accuracy
    overallWinRate: pct(guessWins, guessRows.length),
    guessGamesPlayed: guessRows.length,
    streak: streaks(rows.map((r) => r.puzzle_date), today),
    games,
    allFourDays: Object.values(gamesPerDay).filter((n) => n >= 4).length,
    holeInOnes: guessRows.filter((r) => r.won && r.guesses === 1).length,
    clutchWins: guessRows.filter((r) => r.won && r.guesses === 5).length,
    speedRuns: guessRows.filter((r) => r.won && Number.isFinite(r.active_seconds) && r.active_seconds < 60).length,
    noHintWins: games.dailyGame.noHintWins + games.dailyWinner.noHintWins,
    perfectFaceoffs: games.faceoff.perfectGames + games.nominationsFaceoff.perfectGames,
  };
}

// value/goal drive both the unlocked state and the progress bar.
export const ACHIEVEMENTS = [
  { id: "opening-night", icon: "Clapperboard", title: "Opening Night", description: "Finish your first game", value: (s) => s.totalGames, goal: 1 },
  { id: "hole-in-one", icon: "Target", title: "One-Take Wonder", description: "Solve a Daily Movie on your first guess", value: (s) => s.holeInOnes, goal: 1 },
  { id: "clutch", icon: "Zap", title: "Final Cut", description: "Win on your fifth and final guess", value: (s) => s.clutchWins, goal: 1 },
  { id: "no-hints", icon: "EyeOff", title: "No Spoilers Needed", description: "Win 10 Daily Movie games without the plot hint", value: (s) => s.noHintWins, goal: 10 },
  { id: "speed-run", icon: "Timer", title: "Gone in 60 Seconds", description: "Solve a Daily Movie in under 60 seconds", value: (s) => s.speedRuns, goal: 1 },
  { id: "clean-sweep", icon: "Swords", title: "Picture Perfect", description: "Get all 5 rounds right in a Faceoff", value: (s) => s.perfectFaceoffs, goal: 1 },
  { id: "sharpshooter", icon: "Crosshair", title: "Top Gun", description: "Get 10 perfect Faceoffs", value: (s) => s.perfectFaceoffs, goal: 10 },
  { id: "quadruple-feature", icon: "LayoutGrid", title: "Quadruple Feature", description: "Play all 4 games in one day", value: (s) => s.allFourDays, goal: 1 },
  { id: "oscar-buff", icon: "Trophy", title: "And the Oscar Goes To…", description: "Win 25 Daily Movie (Oscar Edition) games", value: (s) => s.games.dailyWinner.wins, goal: 25 },
  { id: "week-run", icon: "Flame", title: "Opening Week", description: "Reach a 7-day streak", value: (s) => s.streak.best, goal: 7 },
  { id: "month-run", icon: "Flame", title: "Held Over", description: "Reach a 30-day streak", value: (s) => s.streak.best, goal: 30 },
  { id: "century-run", icon: "Flame", title: "Cult Classic", description: "Reach a 100-day streak", value: (s) => s.streak.best, goal: 100 },
  { id: "box-office-smash", icon: "Ticket", title: "Box Office Smash", description: "Play 100 games", value: (s) => s.totalGames, goal: 100 },
];

export function achievementProgress(stats) {
  return ACHIEVEMENTS.map((a) => {
    const value = a.value(stats);
    return { ...a, value: Math.min(value, a.goal), unlocked: value >= a.goal };
  });
}
