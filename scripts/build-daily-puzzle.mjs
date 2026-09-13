// Precomputes today's puzzle for all four daily games — Daily Movie, Daily Movie
// (Oscar Edition), Faceoff, and Faceoff (Oscar Edition) — and writes it to
// public/puzzles/<date>.json, which Vite copies straight into the deployed site.
// The puzzle is identical for every player on a given date (see RESET_TIMEZONE in
// src/dailyMovie.js), so resolving it once here — instead of every visitor's
// browser separately hitting Wikipedia — is what the scheduled workflow
// (.github/workflows/build-daily-puzzle.yml) exists for. It commits whatever this
// script writes, which pushes to main and triggers the normal deploy.
//
// The client (FaceoffGame.jsx / DailyGuessGame.jsx) fetches /puzzles/<date>.json
// first and only falls back to live client-side resolution if a game's key is
// missing from it — so a game failing to resolve here (a network hiccup, or
// Wikipedia rate-limiting a run that touches all four games back to back) just
// means that game's players get today's puzzle the old way; it doesn't block the
// other three games' precomputed entries from shipping.
//
// Usage: node scripts/build-daily-puzzle.mjs

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDailyMovie, getDailyOscarWinner, todayGameDateString } from "../src/dailyMovie.js";
import { getDailyFaceoff } from "../src/faceoff.js";
import { getDailyNominationsFaceoff } from "../src/nominationsFaceoff.js";

// Keys match each game's own localStorage storageId (DailyGame.jsx: "dailyGame",
// OscarWinnerGame.jsx: "dailyWinner", Faceoff.jsx: "faceoff",
// NominationsFaceoff.jsx: "nominationsFaceoff") so the client can look itself up
// by the same id it already uses for caching.
const GAMES = [
  { key: "dailyGame", resolve: getDailyMovie },
  { key: "dailyWinner", resolve: getDailyOscarWinner },
  { key: "faceoff", resolve: getDailyFaceoff },
  { key: "nominationsFaceoff", resolve: getDailyNominationsFaceoff },
];

async function main() {
  const date = todayGameDateString();
  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/puzzles");
  const outPath = path.join(outDir, `${date}.json`);

  // The workflow runs twice a day (to land shortly after midnight regardless of
  // which side of a DST transition America/New_York is on — see the cron
  // schedule's comment) so a same-day rerun is expected. Reuse whatever already
  // resolved instead of re-hitting Wikipedia for it, and only retry the games
  // that failed last time — this also means a fully-resolved day is a no-op
  // (nothing to write, nothing to commit) rather than a wasted redeploy.
  let result = { date, generatedAt: new Date().toISOString() };
  if (existsSync(outPath)) {
    try {
      const existing = JSON.parse(readFileSync(outPath, "utf8"));
      if (existing?.date === date) result = existing;
    } catch (e) {
      // corrupt/unreadable existing file — fall through and regenerate everything
    }
  }

  const toResolve = GAMES.filter((g) => !(g.key in result));
  if (result.date === date && toResolve.length === 0) {
    console.log(`${outPath} already has all ${GAMES.length} games for ${date} — nothing to do.`);
    return;
  }

  const problems = [];
  for (const game of toResolve) {
    try {
      result[game.key] = await game.resolve(date);
      console.log(`${game.key}: resolved`);
    } catch (e) {
      problems.push(`${game.key}: ${e.message}`);
      console.error(`${game.key}: FAILED — ${e.message}`);
    }
  }
  result.generatedAt = new Date().toISOString();

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`\nWrote ${outPath}`);

  if (problems.length) {
    console.log(
      `\n${problems.length}/${GAMES.length} game(s) failed to resolve — those games' players fall back to live resolution today, and the next scheduled run will retry them:`
    );
    problems.forEach((p) => console.log(`  - ${p}`));
  }
}

main();
