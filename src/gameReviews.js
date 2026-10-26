import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { loadReviews as loadAccountReviews, saveReview, toMoviePayload, writeDetailsCache, isNetworkError } from "./cloudStore.js";

/* ---------------------------------------------------------
   Ratings on the game pages (Daily Movie, Faceoff), in the
   same movieId -> { rating, movie, details } shape the home
   page uses.

   Signed out: kept in this browser ("movieReviews"), like
   the home page, and offered for import on sign-in.
   Signed in: read from and saved to the account, so they
   show up everywhere and count toward the Hitflix score.
--------------------------------------------------------- */

const REVIEWS_STORAGE_KEY = "movieReviews";

function loadLocalReviews() {
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveLocalReviews(reviews) {
  try {
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  } catch (e) {}
}

// Same channel as App.jsx: an open home-page tab reloads when a save lands.
const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("hitflix-account-sync") : null;

export function useGameReviews() {
  // undefined until we know whether someone's signed in
  const [userId, setUserId] = useState(supabase ? undefined : null);
  const [reviews, setReviews] = useState(() => (supabase ? {} : loadLocalReviews()));
  // ratings that didn't reach the account (offline); retried on focus/online
  const unsaved = useRef(new Map());

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const id = data?.session?.user?.id ?? null;
      if (cancelled) return;
      setUserId(id);
      if (!id) {
        setReviews(loadLocalReviews());
        return;
      }
      try {
        const account = await loadAccountReviews(loadLocalReviews());
        // keep anything rated while the account was loading
        if (!cancelled) setReviews((prev) => ({ ...account, ...prev }));
      } catch (e) {
        console.error(e);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(movie, rating) {
    const payload = toMoviePayload(movie);
    if (!payload) return;
    try {
      await saveReview(payload, rating);
      unsaved.current.delete(payload.id);
      try {
        syncChannel?.postMessage({ userId });
      } catch (e) {}
    } catch (e) {
      console.error(e);
      if (isNetworkError(e)) unsaved.current.set(payload.id, { movie, rating });
    }
  }

  useEffect(() => {
    if (!userId) return;
    const retry = () => {
      for (const { movie, rating } of [...unsaved.current.values()]) send(movie, rating);
    };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function saveRating(movie, rating) {
    setReviews((prev) => {
      const next = { ...prev, [movie.id]: { ...prev[movie.id], rating, movie } };
      if (!userId) saveLocalReviews(next);
      return next;
    });
    if (userId) send(movie, rating);
  }

  function saveDetails(movie, details) {
    setReviews((prev) => {
      const next = { ...prev, [movie.id]: { ...prev[movie.id], details } };
      if (userId) writeDetailsCache({ [movie.id]: { details } });
      else saveLocalReviews(next);
      return next;
    });
  }

  return { reviews, saveRating, saveDetails };
}
