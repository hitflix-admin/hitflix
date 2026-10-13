import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Plus, GripVertical, Trash2, ArrowLeft, Film, ExternalLink, Check } from "lucide-react";
import logo from "./assets/hitflix-logo-transparent.png";
import { COLORS, inputStyle, primaryBtn, secondaryBtn, dangerBtn, segmentBtn, segmentBtnActive, iconBtn } from "./theme.js";
import GameCard, { GAME_INFO } from "./GameCard.jsx";
import { getDailyQuote } from "./dailyQuote.js";
import {
  cleanMovieTitle,
  yearFromDescription,
  searchWikipediaFilms,
  fetchMovieDetails,
  detailsLookStale,
} from "./movieData.js";
import { calcScore, Gauge, PosterArt } from "./movieUI.jsx";
import MovieModal from "./MovieModal.jsx";
import { useAuth, AccountButton, SignInModal, UsernameModal, ImportModal } from "./Account.jsx";
import ProfileModal from "./Profile.jsx";
import { useFriends, FriendsButton, FriendsModal } from "./Friends.jsx";
import { recordFinishedGames, markActiveToday } from "./gameResults.js";
import {
  loadCloud,
  syncLists,
  syncRatings,
  writeDetailsCache,
  importLocal,
  countImportable,
  importDoneKey,
} from "./cloudStore.js";

/* ---------------------------------------------------------
   HITFLIX — a personal film ledger
   Palette:   ink #141414 / surface #1E1E1E / paper #E7E9EC / mute #8D96A3
              cobalt #6E99D4 (primary accent) — see theme.js COLORS for
              the rest (orchid/caramel/fern/scarlet) and why they're split
              from the decorative-vs-semantic original blue/rose/amber/green
   Type: "Montserrat" — extrabold + tracked caps for display,
         regular/medium for body
--------------------------------------------------------- */

// UUIDs (not short random strings) so list and entry ids double as their
// database ids once signed in
const uid = () => crypto.randomUUID();

// Shown as "Add rating" placeholders in an otherwise-empty library so new users
// see what rating a movie looks like before they've rated anything themselves.
const DEFAULT_LIBRARY_PAGE_TITLES = [
  "Raiders of the Lost Ark",
  "The Dark Knight",
  "Spirited Away",
  "Back to the Future",
];

async function fetchDefaultLibraryMovies() {
  const summaries = await Promise.all(
    DEFAULT_LIBRARY_PAGE_TITLES.map(async (pageTitle) => {
      try {
        const r = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
        );
        if (!r.ok) return null;
        return await r.json();
      } catch (e) {
        return null;
      }
    })
  );

  return summaries.filter(Boolean).map((s) => ({
    id: String(s.pageid),
    title: cleanMovieTitle(s.title),
    pageTitle: s.title,
    year: yearFromDescription(s.description || s.extract),
    description: s.description || "",
    extract: s.extract || "",
    poster: s.thumbnail ? s.thumbnail.source : null,
    pageUrl: s.content_urls?.desktop?.page || "",
  }));
}

// Lets tabs signed into the same account in this browser tell each other a
// save landed, so the others reload right away instead of showing stale data.
const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("hitflix-account-sync") : null;

function announceSaved(userId) {
  try {
    syncChannel?.postMessage({ userId });
  } catch (e) {}
}

function loadLocalLists() {
  let loadedLists = [];
  try {
    const raw = localStorage.getItem("lists");
    loadedLists = raw ? JSON.parse(raw) : [];
  } catch (e) {
    loadedLists = [];
  }

  // strip Wikipedia disambiguation suffixes like "(film)" from titles saved before
  // this was cleaned at search time; keep the raw title as pageTitle for lookups
  let titlesChanged = false;
  const cleanEntry = (e) => {
    if (!e.title) return e;
    const cleaned = cleanMovieTitle(e.title);
    if (cleaned === e.title) return e;
    titlesChanged = true;
    return { ...e, pageTitle: e.pageTitle || e.title, title: cleaned };
  };
  loadedLists = loadedLists.map((l) => ({
    ...l,
    entries: (l.entries || []).map(cleanEntry),
    honorableMentions: (l.honorableMentions || []).map(cleanEntry),
  }));
  if (titlesChanged) {
    try {
      localStorage.setItem("lists", JSON.stringify(loadedLists));
    } catch (e) {}
  }

  return loadedLists;
}

function loadLocalReviews(loadedLists) {
  let reviews = {};
  try {
    const rawReviews = localStorage.getItem("movieReviews");
    if (rawReviews) {
      // fields cached before the copy change said "Unknown" — swap to "TBD" in place
      const loadedReviews = JSON.parse(rawReviews);
      let unknownChanged = false;
      const normalized = {};
      for (const [id, entry] of Object.entries(loadedReviews)) {
        let details = entry.details;
        if (details) {
          const fixedDetails = { ...details };
          for (const key of ["releaseDateUS", "director", "budget", "boxOffice"]) {
            if (fixedDetails[key] === "Unknown") {
              fixedDetails[key] = "TBD";
              unknownChanged = true;
            }
          }
          details = fixedDetails;
        }
        normalized[id] = { ...entry, details };
      }
      reviews = normalized;
      if (unknownChanged) {
        localStorage.setItem("movieReviews", JSON.stringify(normalized));
      }
    } else {
      // migrate ratings/details that used to live per-list-entry onto the shared-by-id map;
      // when the same movie was rated differently across lists, keep the highest score
      const migrated = {};
      for (const l of loadedLists) {
        const pool = [...(l.entries || []), ...(l.honorableMentions || [])];
        for (const e of pool) {
          if (!e.rating) continue;
          const existingScore = calcScore(migrated[e.id]?.rating);
          const candidateScore = calcScore(e.rating);
          if (!migrated[e.id] || (existingScore ?? -Infinity) < (candidateScore ?? -Infinity)) {
            migrated[e.id] = { rating: e.rating, details: e.details || migrated[e.id]?.details };
          }
        }
      }
      reviews = migrated;
      if (Object.keys(migrated).length > 0) {
        localStorage.setItem("movieReviews", JSON.stringify(migrated));
      }
    }
  } catch (e) {
    reviews = {};
  }

  return reviews;
}

export default function App() {
  const [view, setView] = useState("home"); // home | editor
  const [lists, setLists] = useState(null); // null = loading
  const [currentId, setCurrentId] = useState(null);
  const [status, setStatus] = useState(""); // saved indicator
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newName, setNewName] = useState("");
  const [newLength, setNewLength] = useState("");
  const [newRanked, setNewRanked] = useState(true);
  const [newAddOrder, setNewAddOrder] = useState("bottomUp");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [homeQuery, setHomeQuery] = useState("");
  const [homeResults, setHomeResults] = useState([]);
  const [homeSearching, setHomeSearching] = useState(false);
  const [homeSearchError, setHomeSearchError] = useState("");

  const [modalRef, setModalRef] = useState(null); // { listId, uid } | { movie } | null
  const [reviews, setReviews] = useState({}); // movieId -> { rating, details }, shared across all lists
  const [defaultMovies, setDefaultMovies] = useState([]); // the 4 "add rating" starter placeholders

  const auth = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [viewUser, setViewUser] = useState(null); // someone else's profile, opened from Friends
  const [loadAttempt, setLoadAttempt] = useState(0);

  const dragState = useRef(null);
  const dragOriginalOrderRef = useRef(null); // uid -> pre-drag rank, frozen for the duration of a drag
  const [dragIndex, setDragIndex] = useState(null);
  const [dragY, setDragY] = useState(0);
  const rowRefs = useRef([]);
  const saveTimer = useRef(null);
  const saveReviewsTimer = useRef(null);
  // kept in sync every render so the pointermove/pointerup listeners (added once
  // per drag gesture) never act on a stale snapshot of lists/currentId
  const listsRef = useRef(null);
  const currentIdRef = useRef(null);
  const reviewsRef = useRef({});

  // ---- load ----
  // Signed out, lists and reviews live in this browser's localStorage, as they
  // always have. Signed in, they live in the account (cloudStore.js), and
  // localStorage is left alone as the signed-out copy.
  const userId = auth.user?.id ?? null;
  const friends = useFriends(auth.profile?.username ? userId : null);
  // read at call time by the tab-focus refresh, which is set up once per user
  const refreshFriendsRef = useRef(friends.refresh);
  refreshFriendsRef.current = friends.refresh;
  const userIdRef = useRef(null);
  userIdRef.current = userId;
  // what the database is known to hold — each save pushes the diff from here
  const syncedListsRef = useRef([]);
  const syncedReviewsRef = useRef({});
  const syncQueue = useRef(Promise.resolve());
  const [loadError, setLoadError] = useState("");
  const [importOffer, setImportOffer] = useState(null); // { counts, localLists, localReviews, busy, error }

  useEffect(() => {
    if (auth.loading) return;
    let cancelled = false;
    setLists(null);
    setLoadError("");
    setImportOffer(null);
    setView("home");
    setCurrentId(null);
    setModalRef(null);
    (async () => {
      const localLists = loadLocalLists();
      const localReviews = loadLocalReviews(localLists);
      if (!userId) {
        setLists(localLists);
        setReviews(localReviews);
        return;
      }
      try {
        const cloud = await loadCloud(localReviews);
        if (cancelled) return;
        syncedListsRef.current = cloud.lists;
        syncedReviewsRef.current = cloud.reviews;
        setLists(cloud.lists);
        setReviews(cloud.reviews);
        // today counts toward the streak, and games finished on this browser
        // before signing in still count; then refresh the button's streak
        Promise.all([markActiveToday(), recordFinishedGames()]).then(auth.refreshStreak);
        const counts = countImportable(localLists, localReviews);
        let alreadyAsked = false;
        try {
          alreadyAsked = localStorage.getItem(importDoneKey(userId)) !== null;
        } catch (e) {}
        if ((counts.lists > 0 || counts.ratings > 0) && !alreadyAsked) {
          setImportOffer({ counts, localLists, localReviews });
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoadError("Couldn't load your lists. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.loading, userId, loadAttempt]);

  useEffect(() => {
    (async () => {
      try {
        const rawDefaults = localStorage.getItem("defaultLibraryMovies");
        const cached = rawDefaults ? JSON.parse(rawDefaults) : null;
        if (Array.isArray(cached) && cached.length > 0) {
          setDefaultMovies(cached);
          return;
        }
      } catch (e) {}
      const fetched = await fetchDefaultLibraryMovies();
      if (fetched.length > 0) {
        setDefaultMovies(fetched);
        try {
          localStorage.setItem("defaultLibraryMovies", JSON.stringify(fetched));
        } catch (e) {}
      }
    })();
  }, []);

  // ---- persist (debounced) ----
  // Signed-in saves run one at a time, in order, so each diff is taken against
  // what the previous save actually left in the database.
  function enqueueSync(task) {
    syncQueue.current = syncQueue.current.then(task).then(
      () => setStatus("Saved"),
      (e) => {
        console.error(e);
        setStatus("Couldn't save");
      }
    );
    return syncQueue.current;
  }

  const persist = useCallback((next) => {
    setLists(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("Saving…");
    const owner = userIdRef.current;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      // signed in or out since this edit — it belongs to the other storage
      if (userIdRef.current !== owner) return;
      if (owner) {
        enqueueSync(async () => {
          await syncLists(syncedListsRef.current, next, owner);
          syncedListsRef.current = next;
          announceSaved(owner);
        });
        return;
      }
      try {
        localStorage.setItem("lists", JSON.stringify(next));
        setStatus("Saved");
      } catch (e) {
        setStatus("Couldn't save");
      }
    }, 500);
  }, []);

  const persistReviews = useCallback((next) => {
    setReviews(next);
    if (saveReviewsTimer.current) clearTimeout(saveReviewsTimer.current);
    setStatus("Saving…");
    const owner = userIdRef.current;
    saveReviewsTimer.current = setTimeout(() => {
      saveReviewsTimer.current = null;
      if (userIdRef.current !== owner) return;
      if (owner) {
        writeDetailsCache(next);
        enqueueSync(async () => {
          await syncRatings(syncedReviewsRef.current, next, listsRef.current);
          syncedReviewsRef.current = next;
          announceSaved(owner);
        });
        return;
      }
      try {
        localStorage.setItem("movieReviews", JSON.stringify(next));
        setStatus("Saved");
      } catch (e) {
        setStatus("Couldn't save");
      }
    }, 500);
  }, []);

  // Another tab or device may have changed the account since this tab loaded,
  // and saving from a stale copy would undo those changes. So this tab reloads
  // from the account when another tab here announces a save, and when you
  // switch or click back into it. Skipped whenever this tab has its own edits
  // waiting to save, so those are never dropped.
  useEffect(() => {
    if (!userId) return;
    const hasPendingEdits = () => saveTimer.current || saveReviewsTimer.current || dragState.current;
    let refreshQueued = false;
    function refresh() {
      if (document.visibilityState !== "visible") return;
      // a tab left open past midnight starts the new day's streak when you return
      markActiveToday().then((added) => added && auth.refreshStreak());
      refreshFriendsRef.current();
      if (hasPendingEdits() || refreshQueued) return;
      refreshQueued = true;
      // queued behind any in-flight save so the reload sees its result
      syncQueue.current = syncQueue.current.then(async () => {
        refreshQueued = false;
        try {
          const cloud = await loadCloud(reviewsRef.current);
          if (userIdRef.current !== userId || hasPendingEdits()) return;
          syncedListsRef.current = cloud.lists;
          syncedReviewsRef.current = cloud.reviews;
          setLists(cloud.lists);
          setReviews(cloud.reviews);
          // the open list may have been deleted elsewhere
          if (currentIdRef.current && !cloud.lists.some((l) => l.id === currentIdRef.current)) {
            setView("home");
            setCurrentId(null);
          }
        } catch (e) {
          console.error(e);
        }
      });
    }
    function onAnnounce(e) {
      if (e.data?.userId === userId) refresh();
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    syncChannel?.addEventListener("message", onAnnounce);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      syncChannel?.removeEventListener("message", onAnnounce);
    };
  }, [userId]);

  function runImport() {
    const offer = importOffer;
    const owner = userId;
    setImportOffer({ ...offer, busy: true, error: "" });
    enqueueSync(async () => {
      await importLocal(offer.localLists, offer.localReviews, syncedReviewsRef.current);
      try {
        localStorage.setItem(importDoneKey(owner), "imported");
      } catch (e) {}
      const cloud = await loadCloud(offer.localReviews);
      if (userIdRef.current !== owner) return;
      syncedListsRef.current = cloud.lists;
      syncedReviewsRef.current = cloud.reviews;
      setLists(cloud.lists);
      setReviews(cloud.reviews);
      setImportOffer(null);
      announceSaved(owner);
    }).then(() => {
      // enqueueSync swallows errors into the status text; surface them here too
      setImportOffer((o) => (o?.busy ? { ...o, busy: false, error: "Import failed. Try again." } : o));
    });
  }

  function skipImport() {
    try {
      localStorage.setItem(importDoneKey(userId), "skipped");
    } catch (e) {}
    setImportOffer(null);
  }

  function openMovieDirect(movie) {
    setModalRef({ movie });
  }

  const currentList = lists && currentId ? lists.find((l) => l.id === currentId) : null;
  listsRef.current = lists;
  reviewsRef.current = reviews;
  currentIdRef.current = currentId;
  const modalList = lists && modalRef?.listId ? lists.find((l) => l.id === modalRef.listId) : null;
  const modalEntry =
    modalList && modalRef
      ? modalList.entries.find((e) => e.uid === modalRef.uid) ||
        (modalList.honorableMentions || []).find((e) => e.uid === modalRef.uid)
      : null;
  const modalBase = modalEntry || modalRef?.movie || null;
  const modalMovie = modalBase
    ? { ...modalBase, rating: reviews[modalBase.id]?.rating, details: reviews[modalBase.id]?.details }
    : null;

  function updateCurrent(mutator) {
    // read from refs, not the closed-over `lists`/`currentId` state: this function
    // gets called from the pointermove/pointerup drag listeners, which are registered
    // once per drag gesture and would otherwise keep acting on a stale snapshot
    const latestLists = listsRef.current;
    const id = currentIdRef.current;
    if (!latestLists || !id) return;
    const next = latestLists.map((l) => (l.id === id ? mutator(l) : l));
    persist(next);
  }

  function createList() {
    const name = newName.trim() || "Untitled list";
    const cap = parseInt(newLength, 10);
    const list = {
      id: uid(),
      name,
      targetLength: Number.isFinite(cap) && cap > 0 ? cap : 0,
      ranked: newRanked,
      addOrder: newAddOrder,
      entries: [],
      honorableMentions: [],
      updatedAt: Date.now(),
    };
    const next = [list, ...(lists || [])];
    persist(next);
    setCurrentId(list.id);
    setView("editor");
    setCreating(false);
    setNewName("");
    setNewLength("");
    setNewRanked(true);
    setNewAddOrder("bottomUp");
  }

  function openList(id) {
    setCurrentId(id);
    setView("editor");
    setQuery("");
    setResults([]);
    setSearchError("");
  }

  function requestDeleteList(id, name, e) {
    e.stopPropagation();
    setDeleteTarget({ id, name });
  }

  function confirmDeleteList() {
    if (!deleteTarget) return;
    const next = (lists || []).filter((l) => l.id !== deleteTarget.id);
    persist(next);
    setDeleteTarget(null);
  }

  function goHome() {
    setView("home");
    setCurrentId(null);
  }

  // ---- search ----
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchError("");
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError("");
    const t = setTimeout(async () => {
      try {
        const r = await searchWikipediaFilms(query.trim());
        if (!cancelled) setResults(r);
      } catch (e) {
        if (!cancelled) setSearchError("Search is unavailable right now. Check your connection and try again.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    if (!homeQuery.trim()) {
      setHomeResults([]);
      setHomeSearchError("");
      return;
    }
    let cancelled = false;
    setHomeSearching(true);
    setHomeSearchError("");
    const t = setTimeout(async () => {
      try {
        const r = await searchWikipediaFilms(homeQuery.trim());
        if (!cancelled) setHomeResults(r);
      } catch (e) {
        if (!cancelled) setHomeSearchError("Search is unavailable right now. Check your connection and try again.");
      } finally {
        if (!cancelled) setHomeSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [homeQuery]);

  function addMovie(movie) {
    if (!currentList) return;
    if (currentList.targetLength > 0 && currentList.entries.length >= currentList.targetLength) return;
    updateCurrent((l) => {
      const entry = { ...movie, uid: uid() };
      const entries = l.addOrder === "bottomUp" ? [entry, ...l.entries] : [...l.entries, entry];
      return { ...l, entries, updatedAt: Date.now() };
    });
  }

  function addHonorableMention(movie) {
    if (!currentList) return;
    updateCurrent((l) => ({
      ...l,
      honorableMentions: [...(l.honorableMentions || []), { ...movie, uid: uid() }],
      updatedAt: Date.now(),
    }));
  }

  function saveRating(rating) {
    if (!modalBase) return;
    const id = modalBase.id;
    // stash the movie's own title/poster/year alongside the rating so it can render in
    // "Your reviews" even when it was rated directly (search or a default placeholder)
    // rather than added to a list — see getReviewedMovies below.
    persistReviews({ ...reviews, [id]: { ...reviews[id], rating, movie: modalBase } });
  }

  function removeEntry(uidToRemove) {
    updateCurrent((l) => ({
      ...l,
      entries: l.entries.filter((e) => e.uid !== uidToRemove),
      updatedAt: Date.now(),
    }));
  }

  function removeHonorableMention(uidToRemove) {
    updateCurrent((l) => ({
      ...l,
      honorableMentions: (l.honorableMentions || []).filter((e) => e.uid !== uidToRemove),
      updatedAt: Date.now(),
    }));
  }

  function setMovieDetails(details) {
    if (!modalBase) return;
    const id = modalBase.id;
    persistReviews({ ...reviews, [id]: { ...reviews[id], details } });
  }

  // ---- drag reorder (pointer events, mobile-friendly) ----
  // fraction of the row-being-passed-over's height the drag must cross before it swaps places
  const SWAP_THRESHOLD = 0.75;

  function onHandlePointerDown(e, index) {
    e.preventDefault();
    const row = rowRefs.current[index];
    if (!row || !currentList) return;
    dragState.current = {
      index,
      startY: e.clientY,
      rowHeight: row.getBoundingClientRect().height,
      // authoritative working copy for the whole gesture, mutated synchronously on
      // every step below. Reading from React state instead would go stale mid-drag:
      // fast pointermove bursts fire faster than React commits, so several of these
      // steps run before a re-render lands, and each would otherwise recompute its
      // swap from the same pre-drag snapshot, clobbering earlier steps in the burst
      entries: currentList.entries.slice(),
    };
    // rank numbers stay frozen at their pre-drag values until the drop (see render,
    // below), even though rows keep shifting live to preview where the drop will land
    dragOriginalOrderRef.current = new Map(currentList.entries.map((entry, i) => [entry.uid, i + 1]));
    setDragIndex(index);
    setDragY(0);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    const state = dragState.current;
    if (!state) return;
    let { index, rowHeight, entries } = state;
    let delta = e.clientY - state.startY;
    let didMove = false;

    // a single move can cross several rows at once (fast drags), so loop: each
    // iteration swaps with the adjacent row once SWAP_THRESHOLD of its height has
    // been crossed, then carries over only the leftover distance past that point
    while (Math.abs(delta) >= rowHeight * SWAP_THRESHOLD) {
      const dir = delta > 0 ? 1 : -1;
      const newIndex = Math.min(Math.max(index + dir, 0), entries.length - 1);
      if (newIndex === index) break; // hit the top/bottom edge
      const next = entries.slice();
      const [movedEntry] = next.splice(index, 1);
      next.splice(newIndex, 0, movedEntry);
      entries = next;
      index = newIndex;
      delta -= dir * rowHeight;
      didMove = true;
    }

    dragState.current = { index, startY: e.clientY - delta, rowHeight, entries };
    setDragY(delta);
    if (didMove) {
      setDragIndex(index);
      updateCurrent((l) => ({ ...l, entries }));
    }
  }

  function onPointerUp() {
    dragState.current = null;
    dragOriginalOrderRef.current = null;
    setDragIndex(null);
    setDragY(0);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line
  }, []);

  const wrap = {
    fontFamily: "'Montserrat', sans-serif",
    background: "#141414",
    color: "#E7E9EC",
    minHeight: "100%",
    width: "100%",
  };

  if (lists === null) {
    return (
      <main style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        {loadError ? (
          <div style={{ color: "#8D96A3", fontSize: 14, textAlign: "center", padding: 20 }}>
            {loadError}
            <div style={{ marginTop: 14 }}>
              <button onClick={() => setLoadAttempt((n) => n + 1)} style={{ ...secondaryBtn, flex: "none" }}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: "#8D96A3", fontSize: 14 }}>Loading your lists…</div>
        )}
      </main>
    );
  }

  return (
    <main style={wrap}>
      {view === "home" && (
        <HomeView
          lists={lists}
          reviews={reviews}
          onCreate={() => setCreating(true)}
          onOpen={openList}
          onDelete={requestDeleteList}
          onOpenMovie={(listId, uid) => setModalRef({ listId, uid })}
          homeQuery={homeQuery}
          setHomeQuery={setHomeQuery}
          homeResults={homeResults}
          homeSearching={homeSearching}
          homeSearchError={homeSearchError}
          onOpenSearchResult={openMovieDirect}
          defaultMovies={defaultMovies}
          onOpenStandaloneMovie={openMovieDirect}
          auth={auth}
          onOpenAccount={() => setAccountOpen(true)}
          friendRequestCount={friends.incomingCount}
          onOpenFriends={() => setFriendsOpen(true)}
        />
      )}

      {view === "editor" && currentList && (
        <EditorView
          list={currentList}
          reviews={reviews}
          status={status}
          onBack={goHome}
          onRename={(name) => updateCurrent((l) => ({ ...l, name }))}
          onRecap={(cap) => updateCurrent((l) => ({ ...l, targetLength: cap }))}
          query={query}
          setQuery={setQuery}
          results={results.filter(
            (r) =>
              !currentList.entries.some((e) => e.id === r.id) &&
              !(currentList.honorableMentions || []).some((e) => e.id === r.id)
          )}
          searching={searching}
          searchError={searchError}
          onAdd={addMovie}
          onAddMention={addHonorableMention}
          onRemove={removeEntry}
          onRemoveMention={removeHonorableMention}
          onOpenMovie={(entry) => setModalRef({ listId: currentList.id, uid: entry.uid })}
          rowRefs={rowRefs}
          dragIndex={dragIndex}
          dragY={dragY}
          dragOriginalOrder={dragIndex !== null ? dragOriginalOrderRef.current : null}
          onHandlePointerDown={onHandlePointerDown}
        />
      )}

      {creating && (
        <CreateModal
          name={newName}
          setName={setNewName}
          length={newLength}
          setLength={setNewLength}
          ranked={newRanked}
          setRanked={setNewRanked}
          addOrder={newAddOrder}
          setAddOrder={setNewAddOrder}
          onCancel={() => {
            setCreating(false);
            setNewName("");
            setNewLength("");
            setNewRanked(true);
            setNewAddOrder("bottomUp");
          }}
          onCreate={createList}
        />
      )}

      {modalMovie && (
        <MovieModal
          movie={modalMovie}
          onClose={() => setModalRef(null)}
          onSaveRating={(rating) => saveRating(rating)}
          onDetails={(details) => setMovieDetails(details)}
        />
      )}

      {accountOpen &&
        (auth.user ? (
          <ProfileModal
            auth={auth}
            onClose={() => setAccountOpen(false)}
            listsCount={lists.length}
            ratingsCount={Object.values(reviews).filter((r) => r?.rating).length}
          />
        ) : (
          <SignInModal onClose={() => setAccountOpen(false)} />
        ))}

      {friendsOpen && auth.user && (
        <FriendsModal friends={friends} onClose={() => setFriendsOpen(false)} onOpenProfile={setViewUser} />
      )}

      {viewUser && auth.user && (
        <ProfileModal
          key={viewUser.id}
          auth={auth}
          viewUser={viewUser}
          onClose={() => setViewUser(null)}
          onRelationChange={friends.refresh}
        />
      )}

      {auth.user && auth.profile && !auth.profile.username && <UsernameModal auth={auth} />}

      {importOffer && auth.profile?.username && (
        <ImportModal offer={importOffer} onImport={runImport} onSkip={skipImport} />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          name={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteList}
        />
      )}
    </main>
  );
}

/* ---------------- Reviewed movies library ---------------- */

function getReviewedMovies(lists, reviews) {
  const byId = new Map();
  for (const l of lists || []) {
    const pool = [...l.entries, ...(l.honorableMentions || [])];
    for (const entry of pool) {
      if (!reviews[entry.id]?.rating) continue;
      if (!byId.has(entry.id)) {
        byId.set(entry.id, { entry, listId: l.id });
      }
    }
  }
  // ratings saved on a movie that was never added to a list (rated straight from
  // search, or from one of the starter placeholders) carry their own title/poster
  // via reviews[id].movie — surface those too, so every rating shows up here.
  for (const [id, review] of Object.entries(reviews)) {
    if (!review?.rating || byId.has(id) || !review.movie) continue;
    byId.set(id, { entry: review.movie, listId: null });
  }
  return Array.from(byId.values());
}

function movieSortYear(entry) {
  const y = parseInt(entry.year, 10);
  return Number.isFinite(y) ? y : null;
}

function sortReviewedMovies(items, mode) {
  const sorted = items.slice();
  if (mode === "newest" || mode === "oldest") {
    const dir = mode === "newest" ? -1 : 1;
    sorted.sort((a, b) => {
      const ya = movieSortYear(a.entry);
      const yb = movieSortYear(b.entry);
      if (ya === null && yb === null) return a.entry.title.localeCompare(b.entry.title);
      if (ya === null) return 1;
      if (yb === null) return -1;
      return dir * (ya - yb);
    });
  } else {
    sorted.sort((a, b) => a.entry.title.localeCompare(b.entry.title));
  }
  return sorted;
}

const SORT_OPTIONS = [
  { key: "alpha", label: "A–Z" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
];

function DefaultMovieTile({ movie, onAddRating }) {
  return (
    <div
      onClick={onAddRating}
      style={{
        background: "#1E1E1E",
        border: "1px dashed rgba(231,233,236,0.2)",
        borderRadius: 4,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
      }}
    >
      <PosterArt poster={movie.poster} title={movie.title} size="fill" />
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          textAlign: "center",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: 1.25,
          width: "100%",
        }}
      >
        {movie.title}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAddRating();
        }}
        style={{
          marginTop: "auto",
          background: "none",
          border: "1px solid rgba(110,153,212,0.6)",
          color: COLORS.cobalt,
          borderRadius: 3,
          padding: "5px 8px",
          fontSize: 11.5,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          width: "100%",
        }}
      >
        Add rating
      </button>
    </div>
  );
}

function ReviewedLibrary({ lists, reviews, onOpenMovie, defaultMovies, onOpenStandaloneMovie }) {
  const [sortMode, setSortMode] = useState("alpha");

  const defaultIds = new Set(defaultMovies.map((m) => m.id));
  const hasNonDefaultRating = Object.entries(reviews).some(
    ([id, r]) => r?.rating && !defaultIds.has(id)
  );
  const unratedDefaults = hasNonDefaultRating
    ? []
    : defaultMovies.filter((m) => !reviews[m.id]?.rating);

  // getReviewedMovies already merges in ratings saved outside a list (search results,
  // rated default placeholders) using the metadata saveRating stashed alongside them.
  const reviewed = sortReviewedMovies(getReviewedMovies(lists, reviews), sortMode);

  return (
    <div style={{ marginTop: 34 }}>
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: 17,
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Your reviews
      </div>
      <div style={{ color: "#8D96A3", fontSize: 12.5, marginBottom: 14 }}>
        {unratedDefaults.length > 0
          ? "Rate these movies to get started or search for your favorite"
          : `${reviewed.length} title${reviewed.length === 1 ? "" : "s"} reviewed`}
      </div>

      {reviewed.length === 0 && unratedDefaults.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(231,233,236,0.18)",
            borderRadius: 4,
            padding: "30px 20px",
            textAlign: "center",
            color: "#8D96A3",
            fontSize: 14,
          }}
        >
          Rate a title in one of your lists and it'll show up here.
        </div>
      ) : (
        <>
          {reviewed.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortMode(opt.key)}
                  style={sortMode === opt.key ? segmentBtnActive : segmentBtn}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="library-grid">
            {unratedDefaults.map((movie) => (
              <DefaultMovieTile
                key={`default-${movie.id}`}
                movie={movie}
                onAddRating={() => onOpenStandaloneMovie(movie)}
              />
            ))}
            {reviewed.map(({ entry, listId }) => (
              <div
                key={listId ? `${listId}-${entry.uid}` : `standalone-${entry.id}`}
                onClick={() => (listId ? onOpenMovie(listId, entry.uid) : onOpenStandaloneMovie(entry))}
                style={{
                  background: "#1E1E1E",
                  border: "1px solid rgba(231,233,236,0.08)",
                  borderRadius: 4,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <PosterArt poster={entry.poster} title={entry.title} size="fill" />
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    textAlign: "center",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: 1.25,
                    width: "100%",
                  }}
                >
                  {entry.title}
                </div>
                <div style={{ marginTop: "auto" }}>
                  <Gauge score={calcScore(reviews[entry.id]?.rating)} size={34} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Home ---------------- */

function GamesSection() {
  return (
    <div style={{ marginTop: 34 }}>
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: 17,
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Games
      </div>
      <div style={{ color: "#8D96A3", fontSize: 12.5, marginBottom: 10 }}>
        One puzzle a day, same for everyone.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <GameCard {...GAME_INFO.daily} />
        <GameCard {...GAME_INFO.oscarWinner} />
        <GameCard {...GAME_INFO.faceoff} />
        <GameCard {...GAME_INFO.nominationsFaceoff} />
      </div>
    </div>
  );
}

function HomeView({
  lists,
  reviews,
  onCreate,
  onOpen,
  onDelete,
  onOpenMovie,
  homeQuery,
  setHomeQuery,
  homeResults,
  homeSearching,
  homeSearchError,
  onOpenSearchResult,
  defaultMovies,
  onOpenStandaloneMovie,
  auth,
  onOpenAccount,
  friendRequestCount,
  onOpenFriends,
}) {
  const dailyQuote = getDailyQuote();
  return (
    <div style={{ padding: "28px 18px 40px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 26 }}>
        {/* wrap-reverse: when the account button doesn't fit beside the logo
            (long name on a phone), it wraps onto its own line *above* the logo,
            still right-aligned, instead of squeezing either one */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap-reverse",
            alignItems: "flex-end",
            justifyContent: "space-between",
            columnGap: 12,
            rowGap: 10,
          }}
        >
          <img
            src={logo}
            alt="Hitflix Movie Club"
            fetchpriority="high"
            style={{ height: 84, width: "auto", maxWidth: "100%", display: "block" }}
          />
          {/* flexShrink 0: wrap to the next line rather than squeeze the button */}
          <div style={{ marginLeft: "auto", maxWidth: "100%", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
            {auth.user && auth.profile?.username && (
              <FriendsButton count={friendRequestCount} onClick={onOpenFriends} />
            )}
            {/* minWidth 0 lets an extreme name wrap instead of overflowing */}
            <div style={{ minWidth: 0 }}>
              <AccountButton auth={auth} onClick={onOpenAccount} />
            </div>
          </div>
        </div>
        <div style={{ color: "#8D96A3", fontSize: 13.5, marginTop: 6 }}>
          {dailyQuote}
        </div>
      </div>

      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: 17,
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        My Movie Lists
      </div>
      <div style={{ color: "#8D96A3", fontSize: 12.5, marginBottom: 10 }}>
        {lists.length === 0 ? "Start your first list below" : `${lists.length} list${lists.length === 1 ? "" : "s"}`}
      </div>

      <button
        onClick={onCreate}
        style={{
          width: "100%",
          background: COLORS.cobalt,
          color: "#141414",
          border: "none",
          borderRadius: 3,
          padding: "13px 16px",
          fontSize: 15,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          cursor: "pointer",
          marginBottom: 28,
        }}
      >
        <Plus size={18} strokeWidth={2.5} />
        New list
      </button>

      {lists.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(231,233,236,0.18)",
            borderRadius: 4,
            padding: "36px 20px",
            textAlign: "center",
            color: "#8D96A3",
            fontSize: 14,
          }}
        >
          <div>No lists yet. Start one above — give it a name, decide how many titles it holds, then search to fill it in.</div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: "#6B7280" }}>
            Try something like "Top 10 of the 2000s," "Movies to Watch with Friends," or "90s Comfort Rewatches."
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lists
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((l) => (
              <div
                key={l.id}
                onClick={() => onOpen(l.id)}
                style={{
                  background: "#1E1E1E",
                  border: "1px solid rgba(231,233,236,0.08)",
                  borderRadius: 4,
                  padding: "14px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", marginRight: 2 }}>
                  {l.entries.slice(0, 3).map((e, i) => (
                    <div key={e.uid} style={{ marginLeft: i === 0 ? 0 : -18, zIndex: 3 - i }}>
                      <PosterArt poster={e.poster} title={e.title} size="thumb" />
                    </div>
                  ))}
                  {l.entries.length === 0 && (
                    <div
                      style={{
                        width: 52,
                        height: 76,
                        borderRadius: 3,
                        border: "1px dashed rgba(231,233,236,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#8D96A3",
                      }}
                    >
                      <Film size={16} strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.name}
                  </div>
                  <div style={{ color: "#8D96A3", fontSize: 12.5 }}>
                    {l.entries.length}
                    {l.targetLength ? ` / ${l.targetLength}` : ""} titles
                  </div>
                </div>
                <button
                  onClick={(e) => onDelete(l.id, l.name, e)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#8D96A3",
                    cursor: "pointer",
                    padding: 6,
                  }}
                  aria-label="Delete list"
                >
                  <Trash2 size={17} strokeWidth={1.6} />
                </button>
              </div>
            ))}
        </div>
      )}

      <GamesSection />

      <MovieLookup
        query={homeQuery}
        setQuery={setHomeQuery}
        results={homeResults}
        searching={homeSearching}
        searchError={homeSearchError}
        onSelect={onOpenSearchResult}
      />

      <ReviewedLibrary
        lists={lists}
        reviews={reviews}
        onOpenMovie={onOpenMovie}
        defaultMovies={defaultMovies}
        onOpenStandaloneMovie={onOpenStandaloneMovie}
      />
    </div>
  );
}

function MovieLookup({ query, setQuery, results, searching, searchError, onSelect }) {
  return (
    <div style={{ marginTop: 34 }}>
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: 17,
          letterSpacing: 0.5,
          marginBottom: 10,
        }}
      >
        Look up a movie
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search
          size={16}
          strokeWidth={1.8}
          style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#8D96A3" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any movie…"
          style={{ ...inputStyle, paddingLeft: 34 }}
        />
      </div>

      {searching && <div style={{ color: "#8D96A3", fontSize: 13 }}>Searching…</div>}
      {searchError && <div style={{ color: COLORS.scarlet, fontSize: 13 }}>{searchError}</div>}
      {!searching && query.trim() && !searchError && results.length === 0 && (
        <div style={{ color: "#8D96A3", fontSize: 13 }}>No titles found for "{query}".</div>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((r) => (
            <div
              key={r.id}
              onClick={() => onSelect(r)}
              style={{
                background: "#1E1E1E",
                border: "1px solid rgba(231,233,236,0.08)",
                borderRadius: 4,
                padding: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
            >
              <PosterArt poster={r.poster} title={r.title} size="thumb" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 11.5, color: "#8D96A3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.description || r.year}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Create modal ---------------- */

function CreateModal({ name, setName, length, setLength, ranked, setRanked, addOrder, setAddOrder, onCancel, onCreate }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          width: "100%",
          maxWidth: 480,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          borderRadius: 10,
          padding: "22px 20px 26px",
          border: "1px solid rgba(231,233,236,0.1)",
        }}
      >
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, textTransform: "uppercase", fontSize: 21, letterSpacing: 0.4, marginBottom: 16 }}>
          New list
        </div>
        <label style={{ display: "block", fontSize: 12.5, color: "#8D96A3", marginBottom: 6 }}>List name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sunday night rewatches"
          style={inputStyle}
        />
        <label style={{ display: "block", fontSize: 12.5, color: "#8D96A3", margin: "16px 0 6px" }}>
          How many titles? (optional)
        </label>
        <input
          type="number"
          min="1"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          placeholder="Leave blank for no limit"
          style={inputStyle}
        />
        <label style={{ display: "block", fontSize: 12.5, color: "#8D96A3", margin: "16px 0 6px" }}>
          List type
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setRanked(true)}
            style={ranked ? segmentBtnActive : segmentBtn}
          >
            Ranked
          </button>
          <button
            type="button"
            onClick={() => setRanked(false)}
            style={!ranked ? segmentBtnActive : segmentBtn}
          >
            Unranked
          </button>
        </div>
        <div style={{ color: "#8D96A3", fontSize: 12, marginTop: 7 }}>
          {ranked
            ? "Titles are numbered 1, 2, 3… from top to bottom."
            : "Titles have no set order."}
        </div>
        {ranked && (
          <>
            <label style={{ display: "block", fontSize: 12.5, color: "#8D96A3", margin: "16px 0 6px" }}>
              Add new titles to
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setAddOrder("bottomUp")}
                style={addOrder === "bottomUp" ? segmentBtnActive : segmentBtn}
              >
                Bottom up
              </button>
              <button
                type="button"
                onClick={() => setAddOrder("topDown")}
                style={addOrder === "topDown" ? segmentBtnActive : segmentBtn}
              >
                Top down
              </button>
            </div>
            <div style={{ color: "#8D96A3", fontSize: 12, marginTop: 7 }}>
              {addOrder === "bottomUp"
                ? "Each new title takes 1st place, pushing earlier titles down."
                : "Each new title is added below the last, filling 1st place first."}
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onCancel} style={secondaryBtn}>
            Cancel
          </button>
          <button onClick={onCreate} style={primaryBtn}>
            Create list
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Delete confirmation modal ---------------- */

function ConfirmDeleteModal({ name, onCancel, onConfirm }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 55,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          width: "100%",
          maxWidth: 400,
          borderRadius: 10,
          padding: "22px 20px 20px",
          border: "1px solid rgba(231,233,236,0.1)",
        }}
      >
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: 19,
            letterSpacing: 0.4,
            marginBottom: 10,
          }}
        >
          Delete list?
        </div>
        <div style={{ color: "#8D96A3", fontSize: 13.5, lineHeight: 1.5, marginBottom: 22 }}>
          Are you sure you want to delete <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{name}</span>? This
          can't be undone.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={secondaryBtn}>
            Don't Delete
          </button>
          <button onClick={onConfirm} style={dangerBtn}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Editor ---------------- */

function EditorView({
  list,
  reviews,
  status,
  onBack,
  onRename,
  onRecap,
  query,
  setQuery,
  results,
  searching,
  searchError,
  onAdd,
  onAddMention,
  onRemove,
  onRemoveMention,
  onOpenMovie,
  rowRefs,
  dragIndex,
  dragY,
  dragOriginalOrder,
  onHandlePointerDown,
}) {
  const honorableMentions = list.honorableMentions || [];
  const full = list.targetLength > 0 && list.entries.length >= list.targetLength;
  const [editingName, setEditingName] = useState(false);

  return (
    <div style={{ paddingBottom: 60 }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "#141414",
          borderBottom: "1px solid rgba(231,233,236,0.08)",
          padding: "14px 1cm 12px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button onClick={onBack} style={iconBtn} aria-label="Back to lists">
            <ArrowLeft size={19} strokeWidth={1.8} />
          </button>
          {editingName ? (
            <input
              autoFocus
              defaultValue={list.name}
              onBlur={(e) => {
                onRename(e.target.value.trim() || "Untitled list");
                setEditingName(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              style={{
                ...inputStyle,
                flex: 1,
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 20,
                letterSpacing: 0.4,
                padding: "4px 8px",
              }}
            />
          ) : (
            <div
              onClick={() => setEditingName(true)}
              style={{
                flex: 1,
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 21,
                letterSpacing: 0.4,
                cursor: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {list.name}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#8D96A3", flexShrink: 0 }}>{status}</div>
        </div>
        <div style={{ color: "#8D96A3", fontSize: 12.5 }}>
          {list.entries.length}
          {list.targetLength ? ` / ${list.targetLength}` : ""} titles · {list.ranked ? "ranked" : "unranked"} · drag the handle to reorder
        </div>
      </div>

      <div style={{ padding: "14px 1cm 0" }}>
        {list.entries.length === 0 && (
          <div
            style={{
              border: "1px dashed rgba(231,233,236,0.18)",
              borderRadius: 4,
              padding: "26px 18px",
              textAlign: "center",
              color: "#8D96A3",
              fontSize: 13.5,
              marginBottom: 18,
            }}
          >
            Search below to add your first title.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
          {list.entries.map((entry, i) => (
            <div
              key={entry.uid}
              ref={(el) => (rowRefs.current[i] = el)}
              style={{
                background: "#1E1E1E",
                border: "1px solid rgba(231,233,236,0.08)",
                borderRadius: 4,
                padding: "10px 10px 10px 6px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                transform: dragIndex === i ? `translateY(${dragY}px)` : "none",
                boxShadow: dragIndex === i ? "0 8px 20px rgba(0,0,0,0.45)" : "none",
                zIndex: dragIndex === i ? 5 : 1,
                position: "relative",
                touchAction: "none",
              }}
            >
              <div
                onPointerDown={(e) => onHandlePointerDown(e, i)}
                style={{
                  color: "#8D96A3",
                  cursor: "grab",
                  padding: "10px 4px",
                  touchAction: "none",
                }}
                aria-label="Drag to reorder"
              >
                <GripVertical size={18} strokeWidth={1.6} />
              </div>
              {list.ranked && (
                <div
                  style={{
                    width: 22,
                    flexShrink: 0,
                    textAlign: "center",
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 15,
                    color: COLORS.cobalt,
                  }}
                >
                  {dragOriginalOrder?.get(entry.uid) ?? i + 1}
                </div>
              )}
              <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                <PosterArt poster={entry.poster} title={entry.title} size="thumb" />
              </div>
              <div onClick={() => onOpenMovie(entry)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#8D96A3",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {entry.year || "Year unknown"}
                  {reviews[entry.id]?.details?.director ? ` · Dir. ${reviews[entry.id].details.director}` : ""}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {calcScore(reviews[entry.id]?.rating) !== null ? (
                  <>
                    <div
                      className="your-score-label"
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        fontWeight: 700,
                        color: "#8D96A3",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Your score
                    </div>
                    <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                      <Gauge score={calcScore(reviews[entry.id]?.rating)} size={60} />
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => onOpenMovie(entry)}
                    style={{
                      background: "transparent",
                      border: `1px solid ${COLORS.cobalt}`,
                      color: COLORS.cobalt,
                      borderRadius: 20,
                      padding: "6px 10px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      fontFamily: "'Montserrat', sans-serif",
                    }}
                  >
                    Add score
                  </button>
                )}
              </div>
              <button
                onClick={() => onRemove(entry.uid)}
                style={{ background: "none", border: "none", color: "#8D96A3", cursor: "pointer", padding: 6 }}
                aria-label={`Remove ${entry.title}`}
              >
                <X size={17} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>

        {list.ranked && (
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 15,
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Honorable mentions
            </div>
            <div style={{ color: "#8D96A3", fontSize: 12, marginBottom: 10 }}>No particular order</div>

            {honorableMentions.length === 0 ? (
              <div
                style={{
                  border: "1px dashed rgba(231,233,236,0.18)",
                  borderRadius: 4,
                  padding: "20px 16px",
                  textAlign: "center",
                  color: "#8D96A3",
                  fontSize: 13,
                }}
              >
                No honorable mentions yet.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 6,
                }}
              >
                {honorableMentions.map((entry) => (
                  <div
                    key={entry.uid}
                    style={{
                      background: "#1E1E1E",
                      border: "1px solid rgba(231,233,236,0.08)",
                      borderRadius: 4,
                      padding: 10,
                      width: 116,
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      position: "relative",
                    }}
                  >
                    <button
                      onClick={() => onRemoveMention(entry.uid)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: "rgba(20,20,20,0.7)",
                        border: "none",
                        borderRadius: "50%",
                        width: 22,
                        height: 22,
                        color: "#8D96A3",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      aria-label={`Remove ${entry.title}`}
                    >
                      <X size={13} strokeWidth={1.8} />
                    </button>
                    <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                      <PosterArt poster={entry.poster} title={entry.title} size="thumb" />
                    </div>
                    <div
                      onClick={() => onOpenMovie(entry)}
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        textAlign: "center",
                        cursor: "pointer",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        lineHeight: 1.25,
                        width: "100%",
                      }}
                    >
                      {entry.title}
                    </div>
                    <div style={{ marginTop: "auto" }}>
                      {calcScore(reviews[entry.id]?.rating) !== null ? (
                        <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                          <Gauge score={calcScore(reviews[entry.id]?.rating)} size={34} />
                        </div>
                      ) : (
                        <button
                          onClick={() => onOpenMovie(entry)}
                          style={{
                            background: "transparent",
                            border: `1px solid ${COLORS.cobalt}`,
                            color: COLORS.cobalt,
                            borderRadius: 20,
                            padding: "4px 8px",
                            fontSize: 9.5,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            fontFamily: "'Montserrat', sans-serif",
                          }}
                        >
                          Add score
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ borderTop: "1px solid rgba(231,233,236,0.08)", paddingTop: 18 }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, textTransform: "uppercase", fontSize: 15, letterSpacing: 0.5, marginBottom: 10 }}>
            Add a title
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search
              size={16}
              strokeWidth={1.8}
              style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#8D96A3" }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movie titles…"
              disabled={full}
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>

          {full && (
            <div style={{ color: COLORS.scarlet, fontSize: 13, marginBottom: 8 }}>
              This list is full ({list.entries.length}/{list.targetLength}). Remove a title to add another.
            </div>
          )}
          {!full && searching && <div style={{ color: "#8D96A3", fontSize: 13 }}>Searching…</div>}
          {!full && searchError && <div style={{ color: COLORS.scarlet, fontSize: 13 }}>{searchError}</div>}
          {!full && !searching && query.trim() && !searchError && results.length === 0 && (
            <div style={{ color: "#8D96A3", fontSize: 13 }}>No titles found for "{query}".</div>
          )}

          {!full && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: "#1E1E1E",
                    border: "1px solid rgba(231,233,236,0.08)",
                    borderRadius: 4,
                    padding: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <PosterArt poster={r.poster} title={r.title} size="thumb" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#8D96A3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.description || r.year}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => onAdd(r)}
                      style={{
                        background: COLORS.cobalt,
                        border: "none",
                        borderRadius: 3,
                        color: "#141414",
                        padding: "8px 10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      <Plus size={14} strokeWidth={2.5} />
                      Add
                    </button>
                    {list.ranked && (
                      <button
                        onClick={() => onAddMention(r)}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(231,233,236,0.2)",
                          borderRadius: 3,
                          color: "#8D96A3",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: 10.5,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          fontFamily: "'Montserrat', sans-serif",
                        }}
                      >
                        Mention
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

