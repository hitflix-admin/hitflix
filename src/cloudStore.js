import { supabase } from "./supabase.js";

/* ---------------------------------------------------------
   Signed-in storage: lists and ratings live in Supabase
   (see supabase/migrations/0003–0004). The app keeps using
   its existing in-memory shapes — lists with entries /
   honorableMentions arrays, and a movieId -> { rating, movie,
   details } reviews map — and this module translates.

   Wikipedia details (director, box office, …) aren't stored
   server-side: they can always be re-fetched, so they stay in
   a per-browser cache.
--------------------------------------------------------- */

export const DETAILS_CACHE_KEY = "movieDetailsCache";
const RATING_KEYS = ["overall", "writing", "performance", "visuals", "audio"];

export const importDoneKey = (userId) => `cloudImportDone:${userId}`;

// ---- shape conversion ----

// Shapes a movie for the database, dropping anything its checks would reject
// (a non-Wikipedia poster, an implausible year) instead of failing the save.
export function toMoviePayload(m) {
  if (!m || !/^\d+$/.test(String(m.id ?? ""))) return null;
  const yearNum = parseInt(m.year, 10);
  const year = yearNum >= 1870 && yearNum <= 2100 ? String(yearNum) : "";
  const poster = typeof m.poster === "string" && m.poster.startsWith("https://upload.wikimedia.org/") ? m.poster : "";
  const pageUrl = typeof m.pageUrl === "string" && m.pageUrl.startsWith("https://en.wikipedia.org/") ? m.pageUrl : "";
  const title = String(m.title || m.pageTitle || "Untitled").slice(0, 300);
  return {
    id: String(m.id),
    title,
    page_title: String(m.pageTitle || title).slice(0, 300),
    year,
    poster_url: poster,
    page_url: pageUrl,
    description: String(m.description || "").slice(0, 500),
    extract: String(m.extract || "").slice(0, 5000),
  };
}

function fromMovieRow(r) {
  return {
    id: r.id,
    title: r.title,
    pageTitle: r.page_title,
    year: r.year ? String(r.year) : "",
    poster: r.poster_url || null,
    pageUrl: r.page_url || "",
    description: r.description || "",
    extract: r.extract || "",
  };
}

function listFields(l) {
  const cap = parseInt(l.targetLength, 10);
  return {
    name: String(l.name || "").trim().slice(0, 100) || "Untitled list",
    target_length: Number.isFinite(cap) ? Math.min(Math.max(cap, 0), 1000) : 0,
    ranked: l.ranked !== false,
    add_order: l.addOrder === "topDown" ? "topDown" : "bottomUp",
  };
}

function entriesPayload(l) {
  const seen = new Set(); // a movie can only appear once per list
  const out = [];
  const add = (entries, section) => {
    let position = 0;
    for (const e of entries || []) {
      const movie = toMoviePayload(e);
      if (!movie || seen.has(movie.id)) continue;
      seen.add(movie.id);
      out.push({ id: e.uid, section, position: position++, movie });
    }
  };
  add(l.entries, "main");
  add(l.honorableMentions, "honorable");
  return out;
}

const entriesKey = (l) =>
  JSON.stringify([(l.entries || []).map((e) => e.uid), (l.honorableMentions || []).map((e) => e.uid)]);

function sameRating(a, b) {
  if (!a || !b) return a === b;
  return RATING_KEYS.every((k) => a[k] === b[k]);
}

function readDetailsCache() {
  try {
    return JSON.parse(localStorage.getItem(DETAILS_CACHE_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}

export function writeDetailsCache(reviews) {
  try {
    const cache = readDetailsCache();
    for (const [id, r] of Object.entries(reviews)) if (r?.details) cache[id] = r.details;
    localStorage.setItem(DETAILS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

// ---- load ----

export async function loadCloud(localReviewsFallback = {}) {
  const [listsRes, reviewsRes] = await Promise.all([
    supabase
      .from("lists")
      .select("id, name, target_length, ranked, add_order, updated_at, list_entries(id, section, position, movie:movies(*))"),
    supabase.from("reviews").select("overall, writing, performance, visuals, audio, movie:movies(*)"),
  ]);
  if (listsRes.error) throw listsRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  const lists = listsRes.data.map((l) => {
    const sorted = [...(l.list_entries || [])].sort((a, b) => a.position - b.position);
    const toEntry = (e) => ({ ...fromMovieRow(e.movie), uid: e.id });
    return {
      id: l.id,
      name: l.name,
      targetLength: l.target_length,
      ranked: l.ranked,
      addOrder: l.add_order,
      updatedAt: Date.parse(l.updated_at),
      entries: sorted.filter((e) => e.section === "main").map(toEntry),
      honorableMentions: sorted.filter((e) => e.section === "honorable").map(toEntry),
    };
  });

  // details: this browser's cache first, then whatever the signed-out
  // movieReviews map already had fetched
  const cache = readDetailsCache();
  const reviews = {};
  for (const [id, r] of Object.entries(localReviewsFallback)) if (r?.details) reviews[id] = { details: r.details };
  for (const [id, details] of Object.entries(cache)) reviews[id] = { details };
  for (const r of reviewsRes.data) {
    const movie = fromMovieRow(r.movie);
    reviews[movie.id] = {
      ...reviews[movie.id],
      movie,
      rating: Object.fromEntries(RATING_KEYS.map((k) => [k, r[k]])),
    };
  }
  return { lists, reviews };
}

// ---- save ----

async function check(promise) {
  const { error } = await promise;
  if (error) throw error;
}

// Pushes whatever changed between two snapshots of the lists array.
export async function syncLists(prev, next, userId) {
  const prevById = new Map(prev.map((l) => [l.id, l]));
  const nextIds = new Set(next.map((l) => l.id));

  for (const l of prev) {
    // "deleting" a list leaves it; the database deletes it once nobody's left
    if (!nextIds.has(l.id)) {
      await check(supabase.from("list_members").delete().eq("list_id", l.id).eq("user_id", userId));
    }
  }

  for (const l of next) {
    const before = prevById.get(l.id);
    const fields = listFields(l);
    if (!before) {
      await check(
        supabase.rpc("create_list", {
          list_id: l.id,
          list_name: fields.name,
          list_target_length: fields.target_length,
          list_ranked: fields.ranked,
          list_add_order: fields.add_order,
        })
      );
    } else if (JSON.stringify(listFields(before)) !== JSON.stringify(fields)) {
      await check(supabase.from("lists").update(fields).eq("id", l.id));
    }
    if (!before ? entriesKey(l) !== entriesKey({}) : entriesKey(before) !== entriesKey(l)) {
      await check(supabase.rpc("sync_list_entries", { target_list: l.id, entries: entriesPayload(l) }));
    }
  }
}

function findMovie(id, reviews, lists) {
  if (reviews[id]?.movie) return reviews[id].movie;
  for (const l of lists || []) {
    const hit = [...(l.entries || []), ...(l.honorableMentions || [])].find((e) => e.id === id);
    if (hit) return hit;
  }
  return null;
}

async function saveReview(movie, rating) {
  await check(
    supabase.rpc("save_review", {
      movie,
      overall: rating.overall,
      writing: rating.writing,
      performance: rating.performance,
      visuals: rating.visuals,
      audio: rating.audio,
    })
  );
}

// Pushes ratings that changed between two snapshots of the reviews map.
export async function syncRatings(prev, next, lists) {
  for (const [id, r] of Object.entries(next)) {
    if (!r?.rating || sameRating(r.rating, prev[id]?.rating)) continue;
    const movie = toMoviePayload(findMovie(id, next, lists));
    if (movie) await saveReview(movie, r.rating);
  }
}

// ---- import (signed-out browser data -> account) ----

export function countImportable(localLists, localReviews) {
  return {
    lists: localLists.length,
    ratings: Object.values(localReviews).filter((r) => r?.rating).length,
  };
}

// Copies this browser's signed-out lists and ratings into the account. Lists
// are always added as new lists; a rating only fills in movies the account
// hasn't rated yet, so an existing account rating is never overwritten.
export async function importLocal(localLists, localReviews, cloudReviews) {
  const oldestFirst = [...localLists].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  for (const l of oldestFirst) {
    const fresh = {
      ...l,
      id: crypto.randomUUID(),
      entries: (l.entries || []).map((e) => ({ ...e, uid: crypto.randomUUID() })),
      honorableMentions: (l.honorableMentions || []).map((e) => ({ ...e, uid: crypto.randomUUID() })),
    };
    await syncLists([], [fresh], null);
  }
  for (const [id, r] of Object.entries(localReviews)) {
    if (!r?.rating || cloudReviews[id]?.rating) continue;
    const movie = toMoviePayload(findMovie(id, localReviews, localLists));
    if (movie) await saveReview(movie, r.rating);
  }
}
