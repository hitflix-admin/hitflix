// Tries to load today's puzzle for one game from the static file the scheduled
// GitHub Action precomputes once a day (see scripts/build-daily-puzzle.mjs) —
// a single small same-origin fetch instead of the dozens of live Wikipedia
// requests each game's own resolver makes. `gameKey` is the game's own
// localStorage storageId ("dailyGame", "dailyWinner", "faceoff",
// "nominationsFaceoff"), which doubles as its key in the precomputed file.
//
// Returns null on any problem — a 404 (the cron hasn't run yet today, or
// failed), a malformed file, a stale date (clock skew, or a deploy that hasn't
// picked up the latest commit yet), or that one game missing from an otherwise
// valid file — so the caller can fall back to its own live resolution path.
export async function fetchPrecomputedPuzzle(date, gameKey) {
  try {
    const res = await fetch(`/puzzles/${date}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.date !== date) return null;
    return data[gameKey] ?? null;
  } catch (e) {
    return null;
  }
}
