// Shared engine behind every Faceoff variant (box office, Oscar nominations, ...):
// streams through a seeded, shuffled candidate order, resolving each one and
// greedily pairing it with a previously-resolved, still-unpaired movie that
// shares a genre tag and has a different `compareKey` value — so every round
// has an unambiguous right answer.

import { mulberry32, daysSinceEpoch } from "./dailyMovie.js";

function seededOrder(seed, length) {
  const rand = mulberry32(seed);
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export async function buildGenrePairs({
  pool,
  dateString,
  seedOffset,
  sideSeedOffset,
  pairsNeeded,
  maxCandidates,
  resolveCandidate,
  compareKey,
}) {
  const order = seededOrder(daysSinceEpoch(dateString) + seedOffset, pool.length);
  const sideRand = mulberry32(daysSinceEpoch(dateString) + sideSeedOffset);

  const waitingByTag = new Map(); // genre tag -> unpaired resolved movies
  const seenIds = new Set();
  const pairs = [];

  // Resolved strictly one candidate at a time — searchWikipediaFilms alone already
  // fans out to ~8 concurrent Wikipedia requests per call, so resolving several
  // candidates in parallel was enough concurrent traffic to trip Wikipedia's rate
  // limiting (429s) partway through a puzzle.
  for (let i = 0; i < Math.min(order.length, maxCandidates) && pairs.length < pairsNeeded; i++) {
    let movie;
    try {
      movie = await resolveCandidate(pool[order[i]]);
    } catch (e) {
      continue;
    }
    if (!movie || seenIds.has(movie.id)) continue;
    seenIds.add(movie.id);

    let opponent = null;
    for (const tag of movie.genreTags) {
      const bucket = waitingByTag.get(tag);
      if (!bucket) continue;
      const idx = bucket.findIndex((m) => m[compareKey] !== movie[compareKey]);
      if (idx !== -1) {
        opponent = bucket.splice(idx, 1)[0];
        break;
      }
    }

    if (opponent) {
      const flip = sideRand() < 0.5;
      pairs.push(flip ? [movie, opponent] : [opponent, movie]);
      // the opponent may still be waiting under other tags — remove it everywhere
      for (const bucket of waitingByTag.values()) {
        const idx = bucket.indexOf(opponent);
        if (idx !== -1) bucket.splice(idx, 1);
      }
    } else {
      for (const tag of movie.genreTags) {
        if (!waitingByTag.has(tag)) waitingByTag.set(tag, []);
        waitingByTag.get(tag).push(movie);
      }
    }
  }

  if (pairs.length < pairsNeeded) {
    throw new Error(`Could only resolve ${pairs.length}/${pairsNeeded} pairs`);
  }
  return pairs;
}
