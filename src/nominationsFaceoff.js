// Builds the day's 5 Nominations Faceoff pairs: same mechanics as Faceoff, but
// the two movies in each pair just need a shared genre tag and a different
// Oscar nomination count — no Wikipedia box-office data required, since the
// nomination count is already known from the Oscar-nominations dataset itself.

import { searchWikipediaFilms, fetchGenreTags } from "./movieData.js";
import { getCandidatePool, titleCaseGuess, todayUTCDateString } from "./dailyMovie.js";
import { buildGenrePairs } from "./facePairing.js";

const PAIRS_NEEDED = 5;
const MAX_CANDIDATES_TO_TRY = 60;
const NOMINATIONS_FACEOFF_SEED_OFFSET = 40000;
const SIDE_SEED_OFFSET = 40001;

async function resolveCandidate(candidate) {
  const guessTitle = titleCaseGuess(candidate.normalizedTitle);
  let results = await searchWikipediaFilms(`${guessTitle} ${candidate.year}`);
  if (results.length === 0) results = await searchWikipediaFilms(guessTitle);
  if (results.length === 0) return null;

  // Require the result's own year to actually be near the candidate's — falling
  // back to results[0] unconditionally let a generically-titled candidate (e.g.
  // "Black Fox", a 1962 documentary) resolve to an unrelated, irrelevant top hit
  // ("The Little Foxes", 1941), silently pairing that movie's title/poster with
  // the wrong nomination count.
  const best = results.find((r) => r.year && Math.abs(Number(r.year) - candidate.year) <= 1);
  if (!best) return null;

  const genreTags = await fetchGenreTags(best.pageTitle);
  if (genreTags.length === 0) return null;

  return {
    id: best.id,
    title: best.title,
    year: candidate.year,
    poster: best.poster,
    pageUrl: best.pageUrl,
    nominations: candidate.nominations,
    genreTags,
  };
}

function toPublicMovie({ title, year, poster, pageUrl, nominations }) {
  return { title, year, poster, pageUrl, value: nominations };
}

export async function getDailyNominationsFaceoff(dateString = todayUTCDateString()) {
  const pairs = await buildGenrePairs({
    pool: getCandidatePool(),
    dateString,
    seedOffset: NOMINATIONS_FACEOFF_SEED_OFFSET,
    sideSeedOffset: SIDE_SEED_OFFSET,
    pairsNeeded: PAIRS_NEEDED,
    maxCandidates: MAX_CANDIDATES_TO_TRY,
    resolveCandidate,
    compareKey: "nominations",
  });

  return pairs.map(([left, right], i) => ({
    id: `${dateString}-${i}`,
    left: toPublicMovie(left),
    right: toPublicMovie(right),
  }));
}
