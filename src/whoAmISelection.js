// "Who am I?" — movie selection. Picks which movie is today's puzzle and
// resolves it against Wikipedia for display (title, poster, year, director).
// Deliberately knows nothing about quotes: scripts/whoAmIQuotes.mjs looks up a
// movie's five quote hints, and scripts/build-daily-puzzle.mjs is the only
// place the two meet (it passes in which pool entries are eligible). That
// keeps either side free to change its sources without touching the other.
//
// Build-time only — the browser never runs this. The game page reads today's
// finished puzzle from /puzzles/<date>.json (see WhoAmIGame.jsx), since the
// quotes file is too big to ship to every visitor.
//
// The pool is two lists merged:
// - whoAmIBoxOffice.json: top 20 domestic grosses of each year, 1977 onward
//   (scripts/build-whoami-boxoffice.mjs, from Box Office Mojo)
// - whoAmIPopCulture.json: 10 hand-picked pop-culture staples per year,
//   1976 onward — iconic, endlessly quoted movies that never topped the box
//   office (The Room, Office Space, Napoleon Dynamite…). Edit freely.

import { normalizeOscarTitle, fetchMovieDetails, findFilmArticle } from "./movieData.js";
import { mulberry32, daysSinceEpoch, todayGameDateString } from "./dailyMovie.js";
import boxOffice from "./whoAmIBoxOffice.json" with { type: "json" };
import popCulture from "./whoAmIPopCulture.json" with { type: "json" };

// Fixed seed for the pool's shuffled order. Changing it reshuffles every
// future day's pick.
const SHUFFLE_SEED = 4242;
const MAX_ATTEMPTS = 25;

// Same movie in both lists (or a re-release a year later) counts once, and is
// tagged with every list it came from.
let cachedPool = null;
export function getWhoAmIPool() {
  if (cachedPool) return cachedPool;
  const byTitle = new Map();
  const add = (source, list) => {
    for (const [year, titles] of Object.entries(list)) {
      for (const title of titles) {
        const key = normalizeOscarTitle(title);
        const matches = byTitle.get(key) || [];
        const existing = matches.find((m) => Math.abs(m.year - Number(year)) <= 1);
        if (existing) {
          if (!existing.sources.includes(source)) existing.sources.push(source);
          continue;
        }
        // key: the entry's stable identity, independent of list order
        matches.push({ key: `${key}|${year}`, title, year: Number(year), sources: [source] });
        byTitle.set(key, matches);
      }
    }
  };
  add("boxOffice", boxOffice);
  add("popCulture", popCulture);
  const pool = [...byTitle.values()].flat().sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));

  // Seeded Fisher–Yates: walking this order one day at a time means no movie
  // repeats until the whole pool has had a turn (years).
  const rand = mulberry32(SHUFFLE_SEED);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  cachedPool = pool;
  return pool;
}

// Finds the candidate's Wikipedia article and pulls display details.
async function resolveCandidate(candidate) {
  const best = await findFilmArticle(candidate.title, candidate.year);
  if (!best) return null;
  const details = await fetchMovieDetails(best.pageTitle, candidate.year, best.title);
  if (!details) return null;
  return {
    id: best.id,
    title: best.title,
    pageTitle: best.pageTitle,
    year: Number(best.year) || candidate.year,
    poster: best.poster,
    pageUrl: best.pageUrl,
    extract: best.extract,
    director: details.director !== "TBD" ? details.director : "",
    cast: details.cast || [],
    key: candidate.key,
    sources: candidate.sources,
  };
}

// Today's movie first, then deterministic fallbacks, each resolved against
// Wikipedia. `include` narrows the pool to entries the caller can use (the
// daily build: movies that have quotes) before indexing, so the shuffled
// order still runs through every usable movie before any repeats. A
// generator so the caller decides when to stop — fallbacks only matter if
// Wikipedia is unreachable for a pick, and start half the pool away so they
// don't collide with the next few days' picks.
export async function* whoAmICandidates(dateString = todayGameDateString(), { include = () => true } = {}) {
  const pool = getWhoAmIPool().filter(include);
  if (pool.length === 0) return;
  const day = daysSinceEpoch(dateString);
  const order = [day, ...Array.from({ length: MAX_ATTEMPTS - 1 }, (_, k) => day + Math.floor(pool.length / 2) + k)];
  for (const i of order) {
    const candidate = pool[((i % pool.length) + pool.length) % pool.length];
    try {
      const resolved = await resolveCandidate(candidate);
      if (resolved) yield resolved;
    } catch (e) {
      // network hiccup on this candidate — try the next deterministic fallback
    }
  }
}
