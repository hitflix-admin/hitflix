// Builds the day's 5 Faceoff pairs (same for every player, changes at UTC
// midnight): each pair is two movies with at least one shared genre tag, and
// the player guesses which grossed more worldwide at the box office.

import { searchWikipediaFilms, fetchMovieDetails, fetchGenreTags, parseBoxOfficeUSD } from "./movieData.js";
import { getCandidatePool, titleCaseGuess, mulberry32, daysSinceEpoch, todayUTCDateString } from "./dailyMovie.js";

const PAIRS_NEEDED = 5;
const MAX_CANDIDATES_TO_TRY = 60;
const FACEOFF_SEED_OFFSET = 20000;
const SIDE_SEED_OFFSET = 20001;

// Deterministic (per date) Fisher-Yates shuffle of pool indexes — every player
// works through candidates in the same order, so they converge on the same pairs.
function seededOrder(dateString, poolLength) {
  const rand = mulberry32(daysSinceEpoch(dateString) + FACEOFF_SEED_OFFSET);
  const order = Array.from({ length: poolLength }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

async function resolveFaceoffCandidate(candidate) {
  const guessTitle = titleCaseGuess(candidate.normalizedTitle);
  let results = await searchWikipediaFilms(`${guessTitle} ${candidate.year}`);
  if (results.length === 0) results = await searchWikipediaFilms(guessTitle);
  if (results.length === 0) return null;

  const best = results.find((r) => r.year && Math.abs(Number(r.year) - candidate.year) <= 1) || results[0];

  const [details, genreTags] = await Promise.all([
    fetchMovieDetails(best.pageTitle, candidate.year, best.title),
    fetchGenreTags(best.pageTitle),
  ]);
  if (!details || genreTags.length === 0) return null;

  const grossUSD = parseBoxOfficeUSD(details.boxOffice);
  if (grossUSD === null) return null;

  return {
    id: best.id,
    title: best.title,
    year: candidate.year,
    poster: best.poster,
    pageUrl: best.pageUrl,
    grossUSD,
    genreTags,
  };
}

function toPublicMovie({ title, year, poster, pageUrl, grossUSD }) {
  return { title, year, poster, pageUrl, grossUSD };
}

export async function getDailyFaceoff(dateString = todayUTCDateString()) {
  const pool = getCandidatePool();
  const order = seededOrder(dateString, pool.length);
  const sideRand = mulberry32(daysSinceEpoch(dateString) + SIDE_SEED_OFFSET);

  const waitingByTag = new Map(); // genre tag -> unpaired resolved movies
  const seenIds = new Set();
  const pairs = [];

  // Resolved strictly one candidate at a time — searchWikipediaFilms alone already
  // fans out to ~8 concurrent Wikipedia requests per call, so resolving several
  // candidates in parallel here was enough concurrent traffic to trip Wikipedia's
  // rate limiting (429s) partway through a puzzle.
  for (let i = 0; i < Math.min(order.length, MAX_CANDIDATES_TO_TRY) && pairs.length < PAIRS_NEEDED; i++) {
    let movie;
    try {
      movie = await resolveFaceoffCandidate(pool[order[i]]);
    } catch (e) {
      continue;
    }
    if (!movie || seenIds.has(movie.id)) continue;
    seenIds.add(movie.id);

    let opponent = null;
    for (const tag of movie.genreTags) {
      const bucket = waitingByTag.get(tag);
      if (!bucket) continue;
      const idx = bucket.findIndex((m) => m.grossUSD !== movie.grossUSD);
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

  if (pairs.length < PAIRS_NEEDED) {
    throw new Error(`Could only resolve ${pairs.length}/${PAIRS_NEEDED} Faceoff pairs`);
  }

  return pairs.map(([left, right], i) => ({
    id: `${dateString}-${i}`,
    left: toPublicMovie(left),
    right: toPublicMovie(right),
  }));
}
