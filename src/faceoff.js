// Builds the day's 5 Faceoff pairs (same for every player, changes at UTC
// midnight): each pair is two movies with at least one shared genre tag, and
// the player guesses which grossed more worldwide at the box office.

import { findFilmArticle, fetchMovieDetails, fetchGenreTags, parseBoxOfficeUSD } from "./movieData.js";
import { getBoxOfficePool, titleCaseGuess, todayGameDateString } from "./dailyMovie.js";
import { buildGenrePairs } from "./facePairing.js";

const PAIRS_NEEDED = 5;
const MAX_CANDIDATES_TO_TRY = 60;
const FACEOFF_SEED_OFFSET = 20000;
const SIDE_SEED_OFFSET = 20001;
const FACEOFF_YEARS_BACK = 60;

async function resolveFaceoffCandidate(candidate) {
  // Prefer the candidate's real Wikipedia-wikilink title (accents, colons,
  // ampersands and all) over round-tripping through the normalized/title-cased
  // form — see the matching comment in dailyMovie.js's resolveCandidate.
  const guessTitle = candidate.displayTitle || titleCaseGuess(candidate.normalizedTitle);
  // Year and title both have to match, or a same-year film the search ranked
  // first stands in, paired with the wrong box-office figure (see
  // findFilmArticle).
  const best = await findFilmArticle(guessTitle, candidate.year);
  if (!best) return null;

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
    pageTitle: best.pageTitle,
    year: candidate.year,
    poster: best.poster,
    pageUrl: best.pageUrl,
    extract: best.extract,
    grossUSD,
    genreTags,
  };
}

// id/pageTitle/extract are carried through so a round's movie can be opened in
// MovieModal (the same "view details, leave a rating" popup used elsewhere on
// the site) — id doubles as the rating's storage key, shared with any rating
// left for the same movie outside this game.
function toPublicMovie({ id, title, pageTitle, year, poster, pageUrl, extract, grossUSD }) {
  return { id, title, pageTitle, year, poster, pageUrl, extract, value: grossUSD };
}

export async function getDailyFaceoff(dateString = todayGameDateString()) {
  const pairs = await buildGenrePairs({
    pool: getBoxOfficePool(FACEOFF_YEARS_BACK),
    dateString,
    seedOffset: FACEOFF_SEED_OFFSET,
    sideSeedOffset: SIDE_SEED_OFFSET,
    pairsNeeded: PAIRS_NEEDED,
    maxCandidates: MAX_CANDIDATES_TO_TRY,
    resolveCandidate: resolveFaceoffCandidate,
    compareKey: "grossUSD",
  });

  return pairs.map(([left, right], i) => ({
    id: `${dateString}-${i}`,
    left: toPublicMovie(left),
    right: toPublicMovie(right),
  }));
}
