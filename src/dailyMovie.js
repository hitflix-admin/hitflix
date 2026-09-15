// Picks the day's featured movie (same for every player, changes at midnight
// US Eastern). getDailyMovie draws from the top-10-grossing-per-year pool
// (boxOfficeTop10.json — real, broadly recognizable hits); getDailyOscarWinner
// draws from the Oscar-nominations database's winners-only pool. Both resolve
// the pick against Wikipedia for display data and score guesses against it.

import { loadOscarAwardsData, normalizeOscarTitle, searchWikipediaFilms, fetchMovieDetails, fetchGenreTags, fetchPlotHint, parseBoxOfficeUSD } from "./movieData.js";
import boxOfficeTop10 from "./boxOfficeTop10.json" with { type: "json" };

const SMALL_WORDS = new Set(["a", "an", "the", "of", "in", "for", "and", "to", "is", "on"]);

export function titleCaseGuess(normalized) {
  return normalized.replace(/[a-z0-9']+/g, (word, offset) => {
    if (offset !== 0 && SMALL_WORDS.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

// Only well-known nominees make fair puzzles: at least one mainstream win, or
// enough nominations to be a multi-category contender, from the sound era onward.
// Raised from 3 after players reported picks that were too obscure to guess.
const MIN_NOMINATIONS_UNLESS_WINNER = 4;
const MIN_YEAR = 1960;

// Categories that don't crown a feature film a general audience would recognize
// as "a movie" — shorts, documentary shorts, and one-off honorary/special awards
// (which are often given for a career or a technical achievement, not a specific
// competitive win). Excluded from the Oscar Winner pool and from its upfront hint.
const NON_FEATURE_CATEGORY_RE = /short|honorary|award of commendation|^special (award|foreign)/i;

function featureCategories(winners) {
  return winners.filter((c) => !NON_FEATURE_CATEGORY_RE.test(c));
}

// Documentary and foreign-language wins are feature-length, but a single win
// there doesn't reliably mean a general audience has heard of the film (unlike
// a Picture/Directing/Acting/Screenplay win). Don't let one of these alone
// qualify a movie for the daily pool — it still counts toward the nomination-
// count path below, same as any other nominee.
const NICHE_WIN_ONLY_CATEGORY_RE = /^documentary|international feature film|foreign language film/i;

function hasMainstreamWin(winners) {
  return featureCategories(winners).some((c) => !NICHE_WIN_ONLY_CATEGORY_RE.test(c));
}

// Ordered from the flashiest, most broadly recognizable win down to the most
// technical/niche one — picks a single upfront hint category when a movie won
// several. Grouped into "families" since the Kaggle dataset preserves each
// era's own category name (e.g. "Actor" predates the 1936 split into Leading
// Role / Supporting Role; "Music (Original Score)" has been renamed a dozen
// times). Song is deliberately ranked low: it names the movie's musical
// numbers rather than crediting the film's craft, and often gives away the
// premise (title songs, character-named songs) more than a genuine hint should.
const CATEGORY_RANK_FAMILIES = [
  ["Best Picture", "Best Motion Picture", "Outstanding Motion Picture", "Outstanding Picture", "Outstanding Production", "Unique and Artistic Picture"],
  ["Directing", "Directing (Comedy Picture)", "Directing (Dramatic Picture)"],
  ["Actor", "Actor in a Leading Role"],
  ["Actress", "Actress in a Leading Role"],
  ["Actor in a Supporting Role"],
  ["Actress in a Supporting Role"],
  [
    "Writing", "Writing (Screenplay)", "Writing (Original Screenplay)", "Writing (Screenplay--Original)",
    "Writing (Original Story)", "Writing (Motion Picture Story)", "Writing (Original Motion Picture Story)",
    "Writing (Screenplay Written Directly for the Screen)",
    "Writing (Screenplay Written Directly for the Screen--Based On Factual Material Or On Story Material Not Previously Published Or Produced)",
    "Writing (Story and Screenplay)",
    "Writing (Story and Screenplay--Written Directly for the Screen)",
    "Writing (Story and Screenplay--Based On Factual Material Or Material Not Previously Published Or Produced)",
    "Writing (Story and Screenplay--Based On Material Not Previously Published Or Produced)",
  ],
  [
    "Writing (Adapted Screenplay)", "Writing (Adaptation)", "Writing (Screenplay Adapted From Other Material)",
    "Writing (Screenplay Based On Material From Another Medium)", "Writing (Screenplay Based On Material Previously Produced Or Published)",
    "Writing (Screenplay--Adapted)", "Writing (Screenplay--Based On Material From Another Medium)",
  ],
  ["Cinematography", "Cinematography (Black-and-White)", "Cinematography (Color)"],
  [
    "Music (Original Score)", "Music (Original Dramatic Score)", "Music (Original Music Score)",
    "Music (Score of a Musical Picture--Original Or Adaptation)", "Music (Scoring of a Musical Picture)",
    "Music (Scoring)", "Music (Music Score of a Dramatic Or Comedy Picture)", "Music (Music Score of a Dramatic Picture)",
    "Music (Music Score--Substantially Original)", "Music (Adaptation Score)",
    "Music (Original Score--for a Motion Picture [Not a Musical])", "Music (Original Musical Or Comedy Score)",
    "Music (Scoring of Music--Adaptation Or Treatment)", "Music (Scoring: Adaptation and Original Song Score)",
    "Music (Scoring: Original Song Score and Adaptation -Or- Scoring: Adaptation)", "Music (Original Song Score)",
    "Music (Original Song Score Or Adaptation Score)", "Music (Original Song Score and Its Adaptation -Or- Adaptation Score)",
    "Music (Original Song Score and Its Adaptation Or Adaptation Score)",
  ],
  ["Visual Effects", "Special Visual Effects", "Special Effects", "Engineering Effects", "Special Achievement Award (Visual Effects)"],
  ["Production Design", "Art Direction", "Art Direction (Black-and-White)", "Art Direction (Color)"],
  ["Animated Feature Film"],
  ["Casting"],
  ["Costume Design", "Costume Design (Black-and-White)", "Costume Design (Color)"],
  ["Film Editing"],
  ["Sound", "Sound Mixing", "Sound Recording"],
  ["Sound Editing", "Sound Effects", "Sound Effects Editing", "Special Achievement Award (Sound Editing)", "Special Achievement Award (Sound Effects Editing)", "Special Achievement Award (Sound Effects)"],
  ["Makeup", "Makeup and Hairstyling"],
  ["Music (Original Song)", "Music (Song)", "Music (Song--Original for the Picture)"],
  ["Documentary", "Documentary (Feature)", "Documentary Feature Film"],
  ["International Feature Film", "Foreign Language Film"],
];

const CATEGORY_RANK = new Map();
CATEGORY_RANK_FAMILIES.forEach((family, rank) => {
  for (const name of family) CATEGORY_RANK.set(name.toLowerCase(), rank);
});

// Unranked categories (one-off historical awards like "Assistant Director" or
// "Dance Direction") sort after every named family.
function categoryRank(category) {
  const rank = CATEGORY_RANK.get((category || "").toLowerCase());
  return rank === undefined ? CATEGORY_RANK_FAMILIES.length : rank;
}

// Picks the single flashiest category from a list of categories a movie won.
function flashiestCategory(categories) {
  return categories.reduce((best, c) => (categoryRank(c) < categoryRank(best) ? c : best));
}

async function buildPool(predicate) {
  const oscarAwardsData = await loadOscarAwardsData();
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

// The box-office-hit pool shared by the regular Daily Movie and regular Faceoff
// games: the top 10 highest-grossing films of each year in src/boxOfficeTop10.json
// (built by scripts/build-boxoffice-data.mjs from Wikipedia's own yearly box-office
// tables) — real box-office hits rather than an Oscar-nomination proxy for fame,
// so mainstream movies with no awards pedigree (Transformers, Meet the Fockers,
// etc.) are eligible too. Daily Movie uses the most recent 45 years of it;
// Faceoff — which needs more variety spread across more rounds — uses the full
// 60-year dataset.
const DAILY_MOVIE_YEARS_BACK = 45;

let cachedFullBoxOfficePool = null;
function getFullBoxOfficePool() {
  if (!cachedFullBoxOfficePool) {
    const pool = [];
    for (const year of Object.keys(boxOfficeTop10).sort()) {
      for (const title of boxOfficeTop10[year]) {
        pool.push({ normalizedTitle: normalizeOscarTitle(title), year: parseInt(year, 10), displayTitle: title });
      }
    }
    cachedFullBoxOfficePool = pool;
  }
  return cachedFullBoxOfficePool;
}

// yearsBack lets each consumer take its own trailing slice of the same dataset
// (see comment above) instead of every consumer needing its own scraped JSON.
export function getBoxOfficePool(yearsBack = DAILY_MOVIE_YEARS_BACK) {
  const pool = getFullBoxOfficePool();
  const years = Object.keys(boxOfficeTop10).map(Number);
  const minYear = Math.max(...years) - yearsBack + 1;
  return pool.filter((c) => c.year >= minYear);
}

// Caches the in-flight promise itself (not just its resolved value), so two
// concurrent callers before the first resolves share one buildPool() call
// instead of triggering it twice.
let cachedCandidatePool = null;
export function getCandidatePool() {
  if (!cachedCandidatePool) {
    cachedCandidatePool = buildPool(
      (e) => hasMainstreamWin(e.winners) || e.nominations >= MIN_NOMINATIONS_UNLESS_WINNER
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

// Box office is now one of the compared fields, so the target needs a known,
// non-trivial gross — otherwise every guess would score "unknown" against it.
// $35M also keeps obscure/unreleased-wide nominees (undermining a game about
// guessable movies) out of the pool. Raised from $25M after players reported
// picks that were too obscure to guess.
const MIN_TARGET_BOX_OFFICE_USD = 35_000_000;

// Coarse enough that most guesses land a "close" bucket without giving away
// the exact figure; the top brackets stay wide since $1B+ hits are rare
// enough that finer buckets there would rarely differ from a plain "correct".
const BOX_OFFICE_BRACKETS = [
  { max: 10_000_000, label: "Under $10M" },
  { max: 50_000_000, label: "$10M–$50M" },
  { max: 200_000_000, label: "$50M–$200M" },
  { max: 500_000_000, label: "$200M–$500M" },
  { max: 1_000_000_000, label: "$500M–$1B" },
  { max: Infinity, label: "$1B+" },
];

export function boxOfficeBracketLabel(grossUSD) {
  if (grossUSD === null || grossUSD === undefined || !Number.isFinite(grossUSD)) return null;
  return BOX_OFFICE_BRACKETS.find((b) => grossUSD <= b.max).label;
}

function boxOfficeBracketIndex(grossUSD) {
  if (grossUSD === null || grossUSD === undefined || !Number.isFinite(grossUSD)) return null;
  return BOX_OFFICE_BRACKETS.findIndex((b) => grossUSD <= b.max);
}

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

// The daily puzzle resets for every player at midnight US Eastern — not each
// visitor's own local timezone, and not UTC midnight (which lands at 7-8 PM
// Eastern, hours before an Eastern player's actual midnight). Anchoring to a
// single real-world zone is what makes the reset a genuinely global, shared
// event instead of drifting per visitor.
const RESET_TIMEZONE = "America/New_York";

// (UTC - zoneTime) offset in minutes for `timeZone` at the given instant.
// Standard Intl-based trick: format the instant's wall-clock components as
// seen in the target zone, reinterpret those same components as if they were
// UTC, and diff against the real instant — DST transitions fall out for free
// since Intl already knows the zone's rules.
function timeZoneOffsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUTC - date.getTime()) / 60000;
}

// The real UTC timestamp that "YYYY-MM-DD 00:00:00" in `timeZone` falls on.
// Two passes to converge correctly right at a DST transition.
function zoneMidnightUTC(dateString, timeZone) {
  const [y, m, d] = dateString.split("-").map(Number);
  let ts = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const offset = timeZoneOffsetMinutes(new Date(ts), timeZone);
    ts = Date.UTC(y, m - 1, d, 0, 0, 0) - offset * 60000;
  }
  return ts;
}

// Every player's "today" — the calendar date in RESET_TIMEZONE, so all
// visitors see the same puzzle change at the same real-world moment
// regardless of their own browser's timezone.
export function todayGameDateString(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RESET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysSinceEpoch(dateString) {
  const ms = Date.UTC(...dateString.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.floor((ms - LAUNCH_EPOCH_MS) / 86400000);
}

export function puzzleNumberForDate(dateString) {
  return daysSinceEpoch(dateString) + 1;
}

export function msUntilNextPuzzle(now = new Date()) {
  const [y, m, d] = todayGameDateString(now).split("-").map(Number);
  // Date.UTC normalizes an out-of-range day (d + 1 can overflow past the
  // month's last day) into the correct next calendar date automatically.
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrowDateString = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
  return zoneMidnightUTC(tomorrowDateString, RESET_TIMEZONE) - now.getTime();
}

// Distinct offsets keep the two games' picks independent (and keep day 0 from
// hashing to a fixed point) while still being deterministic per date. Bumped
// after the resolver misattribution fix to reroll every date (today included)
// onto a fresh pick — anyone who already loaded today's puzzle keeps the movie
// cached in their own localStorage; this only changes what a fresh load sees.
const NOMINEE_SEED_OFFSET = 2000;
const WINNER_SEED_OFFSET = 6000;

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
  // Box-office candidates carry their real Wikipedia-wikilink title (accents,
  // colons, ampersands and all) — prefer that over round-tripping through the
  // normalized/title-cased form, which the Oscar pool's candidates fall back to
  // since they only have a normalized key to work from.
  const guessTitle = candidate.displayTitle || titleCaseGuess(candidate.normalizedTitle);
  let results = await searchWikipediaFilms(`${guessTitle} ${candidate.year}`, candidate.year);
  if (results.length === 0) results = await searchWikipediaFilms(guessTitle, candidate.year);
  if (results.length === 0) return null;

  // Require the result's own year to actually be near the candidate's — falling
  // back to results[0] unconditionally let a generically-titled candidate (e.g.
  // "Black Fox", a 1962 documentary) resolve to an unrelated, irrelevant top hit
  // ("The Little Foxes", 1941), silently pairing that movie's title/poster/extract
  // with a completely different movie's director/cast/runtime/Oscar data.
  const best = results.find((r) => r.year && Math.abs(Number(r.year) - candidate.year) <= 1);
  if (!best) return null;

  const [details, genreTags, plotHint] = await Promise.all([
    fetchMovieDetails(best.pageTitle, candidate.year, best.title),
    fetchGenreTags(best.pageTitle),
    fetchPlotHint(best.pageTitle),
  ]);
  if (!details) return null;

  // Below this, either the gross is genuinely obscure/unreleased-wide (a bad
  // fit for a game about guessable movies) or Wikipedia just doesn't have a
  // parseable figure yet — either way, falling back to the next candidate
  // keeps every player off a target that can't be scored on box office.
  const boxOfficeUSD = parseBoxOfficeUSD(details.boxOffice);
  if (boxOfficeUSD === null || boxOfficeUSD < MIN_TARGET_BOX_OFFICE_USD) return null;

  return {
    id: best.id,
    title: best.title,
    pageTitle: best.pageTitle,
    year: candidate.year,
    poster: best.poster,
    pageUrl: best.pageUrl,
    extract: best.extract,
    director: details.director,
    studio: details.studio,
    cast: details.cast,
    runtimeMinutes: details.runtimeMinutes,
    boxOfficeUSD,
    // fetchMovieDetails already looks these up from the Oscar dataset by the
    // resolved page's own title/year (see lookupOscarAwards) — reading them from
    // there instead of the candidate keeps this function source-agnostic: a
    // box-office candidate has no nominations/winners of its own to pass in, and
    // a non-Oscar hit like Superbad correctly comes back as 0 nominations.
    oscarNominations: details.oscarNominations,
    oscarWinners: details.oscarWinners,
    normalizedTitle: candidate.normalizedTitle,
    genreTags,
    plotHint,
  };
}

// A uniform random pick over this pool is equivalent to picking a random year
// from the last several decades and then a random rank 1-10 within that year —
// the pool is just those (year, rank) pairs flattened out — so a single seeded
// index does both draws at once.
export async function getDailyMovie(dateString = todayGameDateString()) {
  const pool = getBoxOfficePool();
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
// with the flashiest category it won (see CATEGORY_RANK_FAMILIES) picked as an
// upfront hint — a movie with several wins only ever shows the single best one.
export async function getDailyOscarWinner(dateString = todayGameDateString()) {
  const pool = await getWinnerPool();
  const startIndex = poolIndexForDate(dateString, pool.length, WINNER_SEED_OFFSET);

  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = pool[(startIndex + attempt) % pool.length];
    try {
      const resolved = await resolveCandidate(candidate);
      if (!resolved) continue;
      if (resolved.runtimeMinutes && resolved.runtimeMinutes < MIN_FEATURE_RUNTIME_MINUTES) continue;
      const hintOptions = featureCategories(resolved.oscarWinners);
      if (hintOptions.length === 0) continue;
      return { ...resolved, hintCategory: flashiestCategory(hintOptions) };
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

  const studio = setOverlapStatus(guess.studio, target.studio);
  const cast = setOverlapStatus(guess.cast, target.cast);
  const year = numericStatus(Number(guess.year) || null, Number(target.year));
  const boxOffice = numericStatus(boxOfficeBracketIndex(guess.boxOfficeUSD), boxOfficeBracketIndex(target.boxOfficeUSD));
  const nominations = numericStatus(guess.oscarNominations, target.oscarNominations);

  return {
    isCorrectTitle,
    guess: { title: guess.title, poster: guess.poster, year: guess.year },
    guessRaw: {
      year: guess.year,
      director: guess.director,
      studio: guess.studio,
      cast: guess.cast,
      boxOffice: guess.boxOfficeUSD,
      nominations: guess.oscarNominations,
    },
    fields: { director, studio, cast, year, boxOffice, nominations },
  };
}
