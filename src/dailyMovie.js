// Picks the day's mystery movie (same for every player, changes at UTC midnight)
// from the Oscar-nominations database — either the nominee pool (getDailyMovie)
// or the winners-only pool (getDailyOscarWinner) — resolves it against Wikipedia
// for display data, and scores guesses against it.

import { oscarAwardsData, normalizeOscarTitle, searchWikipediaFilms, fetchMovieDetails } from "./movieData.js";

const SMALL_WORDS = new Set(["a", "an", "the", "of", "in", "for", "and", "to", "is", "on"]);

export function titleCaseGuess(normalized) {
  return normalized.replace(/[a-z0-9']+/g, (word, offset) => {
    if (offset !== 0 && SMALL_WORDS.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

// Only well-known nominees make fair puzzles: at least one win, or enough
// nominations to be a multi-category contender, from the sound era onward.
const MIN_NOMINATIONS_UNLESS_WINNER = 3;
const MIN_YEAR = 1960;

// Categories that don't crown a feature film a general audience would recognize
// as "a movie" — shorts, documentary shorts, and one-off honorary/special awards
// (which are often given for a career or a technical achievement, not a specific
// competitive win). Excluded from the Oscar Winner pool and from its upfront hint.
const NON_FEATURE_CATEGORY_RE = /short|honorary|award of commendation|^special (award|foreign)/i;

function featureCategories(winners) {
  return winners.filter((c) => !NON_FEATURE_CATEGORY_RE.test(c));
}

function buildPool(predicate) {
  const pool = [];
  for (const normalizedTitle of Object.keys(oscarAwardsData).sort()) {
    const byYear = oscarAwardsData[normalizedTitle];
    for (const year of Object.keys(byYear).sort()) {
      const entry = byYear[year];
      const yearNum = parseInt(year, 10);
      if (!Number.isFinite(yearNum) || yearNum < MIN_YEAR) continue;
      if (!predicate(entry)) continue;
      pool.push({ normalizedTitle, year: yearNum, nominations: entry.nominations, winners: entry.winners });
    }
  }
  return pool;
}

let cachedCandidatePool = null;
export function getCandidatePool() {
  if (!cachedCandidatePool) {
    cachedCandidatePool = buildPool(
      (e) => e.winners.length > 0 || e.nominations >= MIN_NOMINATIONS_UNLESS_WINNER
    );
  }
  return cachedCandidatePool;
}

let cachedWinnerPool = null;
function getWinnerPool() {
  if (!cachedWinnerPool) {
    cachedWinnerPool = buildPool((e) => featureCategories(e.winners).length > 0);
  }
  return cachedWinnerPool;
}

// Shorts sometimes slip past the category filter above (miscategorized rows,
// pre-1943 "Documentary" entries that were newsreel compilations, etc.) — a
// runtime this low is the last line of defense against a non-feature target.
const MIN_FEATURE_RUNTIME_MINUTES = 40;

// mulberry32 — small, fast, deterministic PRNG so every visitor derives the same
// sequence from the same integer seed (no server round-trip needed for "today's" pick).
export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAUNCH_EPOCH_MS = Date.UTC(2026, 8, 10); // puzzle #1

export function todayUTCDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function daysSinceEpoch(dateString) {
  const ms = Date.UTC(...dateString.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.floor((ms - LAUNCH_EPOCH_MS) / 86400000);
}

export function puzzleNumberForDate(dateString) {
  return daysSinceEpoch(dateString) + 1;
}

export function msUntilNextPuzzle(now = new Date()) {
  const tomorrow = new Date(todayUTCDateString(now) + "T00:00:00.000Z");
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.getTime() - now.getTime();
}

// Distinct offsets keep the two games' picks independent (and keep day 0 from
// hashing to a fixed point) while still being deterministic per date.
const NOMINEE_SEED_OFFSET = 1000;
const WINNER_SEED_OFFSET = 5000;
const HINT_CATEGORY_SEED_OFFSET = 9000;

function poolIndexForDate(dateString, poolLength, seedOffset) {
  const seed = daysSinceEpoch(dateString) + seedOffset;
  const rand = mulberry32(seed)();
  return Math.floor(rand * poolLength);
}

// Resolves the pool candidate against live Wikipedia data (title, poster, extract,
// infobox facts). Falls back to the next pool entry (deterministically, so every
// player still lands on the same fallback) if a candidate can't be resolved —
// e.g. a title too obscure for Wikipedia's search to surface confidently.
async function resolveCandidate(candidate) {
  const guessTitle = titleCaseGuess(candidate.normalizedTitle);
  let results = await searchWikipediaFilms(`${guessTitle} ${candidate.year}`);
  if (results.length === 0) results = await searchWikipediaFilms(guessTitle);
  if (results.length === 0) return null;

  // Require the result's own year to actually be near the candidate's — falling
  // back to results[0] unconditionally let a generically-titled candidate (e.g.
  // "Black Fox", a 1962 documentary) resolve to an unrelated, irrelevant top hit
  // ("The Little Foxes", 1941), silently pairing that movie's title/poster/extract
  // with a completely different movie's director/cast/runtime/Oscar data.
  const best = results.find((r) => r.year && Math.abs(Number(r.year) - candidate.year) <= 1);
  if (!best) return null;

  const details = await fetchMovieDetails(best.pageTitle, candidate.year, best.title);
  if (!details) return null;

  return {
    id: best.id,
    title: best.title,
    pageTitle: best.pageTitle,
    year: candidate.year,
    poster: best.poster,
    pageUrl: best.pageUrl,
    extract: best.extract,
    director: details.director,
    countries: details.countries,
    cast: details.cast,
    runtimeMinutes: details.runtimeMinutes,
    oscarNominations: candidate.nominations,
    oscarWinners: candidate.winners,
    normalizedTitle: candidate.normalizedTitle,
  };
}

export async function getDailyMovie(dateString = todayUTCDateString()) {
  const pool = getCandidatePool();
  const startIndex = poolIndexForDate(dateString, pool.length, NOMINEE_SEED_OFFSET);

  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = pool[(startIndex + attempt) % pool.length];
    try {
      const resolved = await resolveCandidate(candidate);
      if (resolved) return resolved;
    } catch (e) {
      // network hiccup on this candidate — try the next deterministic fallback
    }
  }
  throw new Error("Could not resolve a daily movie");
}

// Same mechanics as getDailyMovie, but drawn only from actual Oscar winners, and
// with one of the categories it won picked (deterministically) as an upfront hint.
export async function getDailyOscarWinner(dateString = todayUTCDateString()) {
  const pool = getWinnerPool();
  const startIndex = poolIndexForDate(dateString, pool.length, WINNER_SEED_OFFSET);

  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = pool[(startIndex + attempt) % pool.length];
    try {
      const resolved = await resolveCandidate(candidate);
      if (!resolved) continue;
      if (resolved.runtimeMinutes && resolved.runtimeMinutes < MIN_FEATURE_RUNTIME_MINUTES) continue;
      const hintOptions = featureCategories(resolved.oscarWinners);
      if (hintOptions.length === 0) continue;
      const hintSeed = daysSinceEpoch(dateString) + HINT_CATEGORY_SEED_OFFSET;
      const hintIndex = Math.floor(mulberry32(hintSeed)() * hintOptions.length);
      return { ...resolved, hintCategory: hintOptions[hintIndex] };
    } catch (e) {
      // network hiccup on this candidate — try the next deterministic fallback
    }
  }
  throw new Error("Could not resolve a daily Oscar winner");
}

/* ---------------- Guess comparison ---------------- */

function normalizeName(s) {
  return (s || "").toLowerCase().trim();
}

function setOverlapStatus(guessList, targetList) {
  if (!guessList?.length || !targetList?.length) return { status: "unknown", shared: [] };
  const targetSet = new Set(targetList.map(normalizeName));
  const shared = guessList.filter((g) => targetSet.has(normalizeName(g)));
  if (shared.length === 0) return { status: "none", shared: [] };
  if (shared.length === guessList.length && shared.length === targetList.length) {
    return { status: "full", shared };
  }
  return { status: "partial", shared };
}

function numericStatus(guessValue, targetValue) {
  if (guessValue === null || guessValue === undefined || !Number.isFinite(guessValue)) {
    return { status: "unknown", direction: null };
  }
  if (guessValue === targetValue) return { status: "correct", direction: null };
  return { status: "wrong", direction: guessValue < targetValue ? "up" : "down" };
}

// Returns a fixed set of comparison "tiles" describing how a guessed movie relates
// to the target, similar in spirit to Wordle's per-letter feedback.
export function compareGuessToTarget(guess, target) {
  const isCorrectTitle = normalizeOscarTitle(guess.title) === normalizeOscarTitle(target.title);

  const director = setOverlapStatus(
    (guess.director || "").split(/[,;]|\s+and\s+/i).map((s) => s.trim()).filter(Boolean),
    (target.director || "").split(/[,;]|\s+and\s+/i).map((s) => s.trim()).filter(Boolean)
  );

  const country = setOverlapStatus(guess.countries, target.countries);
  const cast = setOverlapStatus(guess.cast, target.cast);
  const year = numericStatus(Number(guess.year) || null, Number(target.year));
  const runtime = numericStatus(guess.runtimeMinutes, target.runtimeMinutes);
  const nominations = numericStatus(guess.oscarNominations, target.oscarNominations);

  return {
    isCorrectTitle,
    guess: { title: guess.title, poster: guess.poster, year: guess.year },
    guessRaw: {
      year: guess.year,
      director: guess.director,
      country: guess.countries,
      cast: guess.cast,
      runtime: guess.runtimeMinutes,
      nominations: guess.oscarNominations,
    },
    fields: { director, country, cast, year, runtime, nominations },
  };
}
