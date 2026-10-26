import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { fromMovieRow } from "./cloudStore.js";

/* ---------------------------------------------------------
   The Hitflix score (0015_hitflix_score.sql): everyone's
   average rating for a movie, published only once enough
   people have rated it. Readable signed out too. Shown in the
   movie popup, and on shared lists in place of your own score.
--------------------------------------------------------- */

const BATCH = 200; // hitflix_scores refuses more per call

// movieId -> score, or null when it doesn't have one yet. Movies left out
// of the result had an error (or no Supabase), so the caller can hide the
// score rather than claim there isn't one.
export async function loadHitflixScores(movieIds) {
  const ids = [...new Set(movieIds.map(String).filter((id) => /^\d+$/.test(id)))];
  if (!supabase || !ids.length) return {};
  const scores = {};
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { data, error } = await supabase.rpc("hitflix_scores", { movie_ids: chunk });
    if (error) throw error;
    for (const id of chunk) scores[id] = null;
    for (const row of data || []) scores[row.movie_id] = row.score;
  }
  return scores;
}

// Scores for a set of movies, refetched when the set changes. Pass an empty
// list to skip fetching. undefined for a movie still loading or that failed.
export function useHitflixScores(movieIds) {
  const key = [...new Set(movieIds.map(String))].sort().join(",");
  const [scores, setScores] = useState({});
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    loadHitflixScores(key.split(",")).then(
      (loaded) => !cancelled && setScores((prev) => ({ ...prev, ...loaded })),
      (e) => console.error(e)
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return scores;
}

// Movies other people have rated that are closest to getting a Hitflix score
// and that you haven't rated (0016_movies_close_to_score.sql). Signed in only.
export async function loadMoviesCloseToScore(count = 3) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("movies_close_to_score", { max_movies: count });
  if (error) throw error;
  return (data || []).map(fromMovieRow);
}
