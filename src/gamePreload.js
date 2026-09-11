// Warms the localStorage cache for the games a player *isn't* currently on,
// so clicking a "More games" tile feels instant instead of re-triggering a
// multi-second Wikipedia resolution. Also prunes stale cache entries, since
// none of the four games otherwise expire old dates.

import { getDailyMovie, getDailyOscarWinner, todayUTCDateString } from "./dailyMovie.js";
import { getDailyFaceoff } from "./faceoff.js";
import { getDailyNominationsFaceoff } from "./nominationsFaceoff.js";

const GAMES = [
  { storageId: "dailyGame", resolve: getDailyMovie },
  { storageId: "dailyWinner", resolve: getDailyOscarWinner },
  { storageId: "faceoff", resolve: getDailyFaceoff },
  { storageId: "nominationsFaceoff", resolve: getDailyNominationsFaceoff },
];

// Deliberately not a strict UTC-date regex on the storageId — just needs to
// tell "today" apart from every other cached date across all four games.
const CACHE_KEY_RE = /^(dailyGame|dailyWinner|faceoff|nominationsFaceoff):(target|progress):(\d{4}-\d{2}-\d{2})$/;

function pruneOldEntries(currentDate) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      const match = key.match(CACHE_KEY_RE);
      if (match && match[3] !== currentDate) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}
}

function isTargetCached(storageId, date) {
  try {
    return localStorage.getItem(`${storageId}:target:${date}`) !== null;
  } catch (e) {
    return true; // can't read storage — don't try to write more into it either
  }
}

function cacheTarget(storageId, date, data) {
  try {
    localStorage.setItem(`${storageId}:target:${date}`, JSON.stringify(data));
  } catch (e) {}
}

// Resolves the other three games' puzzles one at a time, never in parallel:
// each game's own resolution already fires many sequential Wikipedia
// requests, and running several of those chains at once was enough
// concurrent traffic to trip Wikipedia's rate limiting once already (see
// facePairing.js). A failed prefetch is silently skipped — that game just
// resolves normally, with its own loading state, when the player opens it.
export async function preloadOtherGames(currentStorageId) {
  const date = todayUTCDateString();
  pruneOldEntries(date);

  for (const game of GAMES) {
    if (game.storageId === currentStorageId) continue;
    if (isTargetCached(game.storageId, date)) continue;
    try {
      const data = await game.resolve(date);
      cacheTarget(game.storageId, date, data);
    } catch (e) {}
  }
}
