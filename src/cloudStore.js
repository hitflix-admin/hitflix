import { supabase } from "./supabase.js";

/* ---------------------------------------------------------
   Signed-in storage: lists and ratings live in Supabase
   (see supabase/migrations/0003–0004). The app keeps using
   its existing in-memory shapes — lists with entries /
   honorableMentions arrays, and a movieId -> { rating, movie,
   details } reviews map — and this module translates.

   Lists can be shared, so they're saved one change at a time
   (add / remove / move one entry, rename, leave — see
   0011_collaborative_lists.sql) rather than as whole snapshots:
   people editing the same list at once don't undo each other.

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

export function fromMovieRow(r) {
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

// [{ id, section, position, movie }] for filling a brand-new list in one go
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

// Every list the user is on, with its members (oldest first), whether its
// join link is on, and, per entry, who added it.
export async function loadLists() {
  const [listsRes, peopleRes, linksRes] = await Promise.all([
    supabase
      .from("lists")
      .select("id, name, target_length, ranked, add_order, updated_at, list_entries(id, section, position, added_by, movie:movies(*))"),
    supabase.rpc("my_list_people"),
    // only ever the caller's own lists' links (RLS)
    supabase.from("list_join_links").select("list_id"),
  ]);
  if (listsRes.error) throw listsRes.error;
  if (peopleRes.error) throw peopleRes.error;
  if (linksRes.error) throw linksRes.error;
  const linkOn = new Set(linksRes.data.map((r) => r.list_id));

  const names = new Map(); // user id -> username, members and former members alike
  const membersByList = new Map();
  for (const p of peopleRes.data) {
    names.set(p.user_id, p.username);
    if (!p.is_member) continue;
    if (!membersByList.has(p.list_id)) membersByList.set(p.list_id, []);
    membersByList.get(p.list_id).push(p);
  }

  return listsRes.data.map((l) => {
    const sorted = [...(l.list_entries || [])].sort((a, b) => a.position - b.position);
    const toEntry = (e) => ({
      ...fromMovieRow(e.movie),
      uid: e.id,
      addedBy: e.added_by,
      addedByName: names.get(e.added_by) || null,
    });
    const members = (membersByList.get(l.id) || [])
      .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at))
      .map((p) => ({ id: p.user_id, username: p.username }));
    return {
      id: l.id,
      name: l.name,
      targetLength: l.target_length,
      ranked: l.ranked,
      addOrder: l.add_order,
      updatedAt: Date.parse(l.updated_at),
      members,
      linkOn: linkOn.has(l.id),
      entries: sorted.filter((e) => e.section === "main").map(toEntry),
      honorableMentions: sorted.filter((e) => e.section === "honorable").map(toEntry),
    };
  });
}

export async function loadReviews(localReviewsFallback = {}) {
  const { data, error } = await supabase
    .from("reviews")
    .select("overall, writing, performance, visuals, audio, movie:movies(*)");
  if (error) throw error;

  // details: this browser's cache first, then whatever the signed-out
  // movieReviews map already had fetched
  const cache = readDetailsCache();
  const reviews = {};
  for (const [id, r] of Object.entries(localReviewsFallback)) if (r?.details) reviews[id] = { details: r.details };
  for (const [id, details] of Object.entries(cache)) reviews[id] = { details };
  for (const r of data) {
    const movie = fromMovieRow(r.movie);
    reviews[movie.id] = {
      ...reviews[movie.id],
      movie,
      rating: Object.fromEntries(RATING_KEYS.map((k) => [k, r[k]])),
    };
  }
  return reviews;
}

export async function loadCloud(localReviewsFallback = {}) {
  const [lists, reviews] = await Promise.all([loadLists(), loadReviews(localReviewsFallback)]);
  return { lists, reviews };
}

// ---- save ----

async function check(promise) {
  const { error } = await promise;
  if (error) throw error;
}

// ---- list changes ----
// Every edit to a list is one of these ops:
//   { type: "create", list }                      a new, empty list
//   { type: "fields", listId, fields }            rename / settings (app keys)
//   { type: "add", listId, entry, section, atTop } entry = movie + uid
//   { type: "remove", listId, uid }
//   { type: "move", listId, uid, afterUid, beforeUid }  within its section
//   { type: "leave", listId }
// applyOp makes the change locally; sendOp saves it. applyOp is also replayed
// over freshly loaded lists for ops not yet saved, so it must be harmless to
// apply to a list that already has the change.

const SECTION_KEY = { main: "entries", honorable: "honorableMentions" };

export function applyOp(lists, op, userId) {
  if (op.type === "create") {
    return lists.some((l) => l.id === op.list.id) ? lists : [op.list, ...lists];
  }
  if (op.type === "leave") return lists.filter((l) => l.id !== op.listId);
  return lists.map((l) => (l.id === op.listId ? applyToList(l, op, userId) : l));
}

function applyToList(l, op, userId) {
  const now = Date.now();
  if (op.type === "fields") return { ...l, ...op.fields, updatedAt: now };
  if (op.type === "remove") {
    return {
      ...l,
      entries: l.entries.filter((e) => e.uid !== op.uid),
      honorableMentions: (l.honorableMentions || []).filter((e) => e.uid !== op.uid),
      updatedAt: now,
    };
  }
  if (op.type === "add") {
    const all = [...l.entries, ...(l.honorableMentions || [])];
    if (all.some((e) => e.uid === op.entry.uid || e.id === op.entry.id)) return l;
    const key = SECTION_KEY[op.section];
    const entry = { ...op.entry, addedBy: userId, addedByName: null };
    const current = l[key] || [];
    return { ...l, [key]: op.atTop ? [entry, ...current] : [...current, entry], updatedAt: now };
  }
  if (op.type === "move") {
    const key = l.entries.some((e) => e.uid === op.uid) ? "entries" : "honorableMentions";
    const current = l[key] || [];
    const moving = current.find((e) => e.uid === op.uid);
    if (!moving) return l;
    const rest = current.filter((e) => e.uid !== op.uid);
    // same placement rules as move_list_entry
    let at;
    if (op.afterUid == null) at = 0;
    else if (rest.some((e) => e.uid === op.afterUid)) at = rest.findIndex((e) => e.uid === op.afterUid) + 1;
    else if (rest.some((e) => e.uid === op.beforeUid)) at = rest.findIndex((e) => e.uid === op.beforeUid);
    else at = rest.length;
    rest.splice(at, 0, moving);
    return { ...l, [key]: rest, updatedAt: now };
  }
  return l;
}

// Adds an op to the unsent queue, folding back-to-back renames/settings
// changes of the same list into one save.
export function queueOp(queue, op) {
  const last = queue[queue.length - 1];
  if (op.type === "fields" && last?.type === "fields" && last.listId === op.listId) {
    return [...queue.slice(0, -1), { ...last, fields: { ...last.fields, ...op.fields } }];
  }
  return [...queue, op];
}

// Saves one op. Returns false when the database already had the change (or
// refused it harmlessly), so the caller should reload to get back in step.
export async function sendOp(op, userId) {
  switch (op.type) {
    case "create": {
      const f = listFields(op.list);
      await check(
        supabase.rpc("create_list", {
          list_id: op.list.id,
          list_name: f.name,
          list_target_length: f.target_length,
          list_ranked: f.ranked,
          list_add_order: f.add_order,
        })
      );
      return true;
    }
    case "fields": {
      const f = listFields(op.fields);
      const columns = { name: "name", targetLength: "target_length", ranked: "ranked", addOrder: "add_order" };
      const update = {};
      for (const [k, col] of Object.entries(columns)) if (k in op.fields) update[col] = f[col];
      await check(supabase.from("lists").update(update).eq("id", op.listId));
      return true;
    }
    case "add": {
      const movie = toMoviePayload(op.entry);
      if (!movie) return false;
      const { data, error } = await supabase.rpc("add_list_entry", {
        entry_id: op.entry.uid,
        target_list: op.listId,
        movie,
        entry_section: op.section,
        at_top: !!op.atTop,
      });
      if (error) throw error;
      return data === true;
    }
    case "remove":
      await check(supabase.rpc("remove_list_entry", { entry_id: op.uid }));
      return true;
    case "move":
      await check(
        supabase.rpc("move_list_entry", { entry_id: op.uid, after_id: op.afterUid ?? null, before_id: op.beforeUid ?? null })
      );
      return true;
    case "leave":
      // the database deletes the list once nobody's left on it
      await check(supabase.from("list_members").delete().eq("list_id", op.listId).eq("user_id", userId));
      return true;
    default:
      return true;
  }
}

// A failed save is worth retrying only if it never reached the database
// (offline, timeout); a database refusal (e.g. "this list is full") isn't.
export const isNetworkError = (e) => !e?.code;

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
    await sendOp({ type: "create", list: fresh });
    const entries = entriesPayload(fresh);
    if (entries.length) await check(supabase.rpc("sync_list_entries", { target_list: fresh.id, entries }));
  }
  for (const [id, r] of Object.entries(localReviews)) {
    if (!r?.rating || cloudReviews[id]?.rating) continue;
    const movie = toMoviePayload(findMovie(id, localReviews, localLists));
    if (movie) await saveReview(movie, r.rating);
  }
}
