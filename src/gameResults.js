import { todayGameDateString } from "./dailyMovie.js";
import { computeStats, achievementProgress } from "./gameStats.js";

/* ---------------------------------------------------------
   Records account activity from any page, signed in only
   (see supabase/migrations/0005):
   - markActiveToday: today counts toward the daily streak
     (any visit counts — the streak isn't about games)
   - recordFinishedGames: finished daily games, for profile
     game stats and achievements
   - findNewAwards: achievements just unlocked, for the
     "award unlocked" popup (AwardsPopup.jsx)

   Each game already keeps its day's progress in localStorage
   (`<game>:progress:<date>`), so results are read from there
   rather than passed in: the same scan covers a game finished
   just now, one finished before signing in today, and one that
   failed to record last time (offline, etc).
--------------------------------------------------------- */

const GUESS_GAMES = ["dailyGame", "dailyWinner"];
const FACEOFF_GAMES = ["faceoff", "nominationsFaceoff"];
const MAX_GUESSES = 5;
const FACEOFF_ROUNDS = 5;
const RECORDED_KEY = "gameResultsRecorded";

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (e) {
    return null;
  }
}

// The database only accepts today's puzzle (and a day either side), so
// there's no point looking further back.
function recentDates() {
  const now = Date.now();
  return [...new Set([todayGameDateString(new Date(now)), todayGameDateString(new Date(now - 86400000))])];
}

// One game_results row from a finished game's saved progress, or null if that
// day's game isn't finished.
export function resultFromProgress(game, date) {
  const progress = readJSON(`${game}:progress:${date}`);
  if (!progress) return null;
  if (GUESS_GAMES.includes(game)) {
    if (progress.status !== "won" && progress.status !== "lost") return null;
    const guesses = Math.min(progress.guesses?.length || 0, MAX_GUESSES);
    if (guesses < 1) return null;
    return {
      game,
      puzzle_date: date,
      won: progress.status === "won",
      guesses,
      // the plot hint can only be revealed before the 5th guess
      hint_used: Boolean(progress.hintUsed) && guesses === MAX_GUESSES,
      active_seconds: Number.isFinite(progress.activeMs)
        ? Math.min(Math.round(progress.activeMs / 1000), 86400)
        : null,
    };
  }
  if (FACEOFF_GAMES.includes(game)) {
    const answers = Array.isArray(progress.answers) ? progress.answers.slice(0, FACEOFF_ROUNDS) : [];
    if (answers.length < FACEOFF_ROUNDS) return null;
    return {
      game,
      puzzle_date: date,
      rounds_correct: answers.filter((a) => a?.correct).length,
      rounds_total: FACEOFF_ROUNDS,
    };
  }
  return null;
}

// Cheap signed-in check that doesn't load supabase-js: the client keeps its
// session under an "sb-<project>-auth-token" key. Lets signed-out game pages
// skip downloading the Supabase library entirely.
function mightBeSignedIn() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || "")) return true;
    }
  } catch (e) {}
  return false;
}

// The signed-in user's id plus the client, or null — loading supabase-js only
// when a session might exist.
async function signedInClient() {
  if (!mightBeSignedIn()) return null;
  const { supabase } = await import("./supabase.js");
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  return userId ? { supabase, userId } : null;
}

const ACTIVE_DAY_KEY = "activeDayRecorded";

// Marks today (the games' America/New_York day) as an active day for the
// signed-in account. Remembered locally so it's one insert per day per
// browser; safe to call on every page load and tab focus. Resolves true only
// when today was newly recorded (so callers know the streak changed).
export async function markActiveToday() {
  try {
    const today = todayGameDateString();
    if (!mightBeSignedIn()) return false;
    const client = await signedInClient();
    if (!client) return false;
    const key = `${client.userId}:${today}`;
    if (readJSON(ACTIVE_DAY_KEY) === key) return false;
    const { error } = await client.supabase.from("activity_days").insert({ day: today });
    // 23505: another tab or device already recorded today
    if (!error || error.code === "23505") {
      localStorage.setItem(ACTIVE_DAY_KEY, JSON.stringify(key));
      return true;
    }
    console.error(error);
  } catch (e) {
    console.error(e);
  }
  return false;
}

let inFlight = null;

// Records every finished, not-yet-recorded recent game for the signed-in
// account. Safe to call often; a no-op when signed out.
export function recordFinishedGames() {
  if (!mightBeSignedIn()) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const client = await signedInClient();
    if (!client) return;
    const { supabase, userId } = client;

    const dates = recentDates();
    // remembered per account so a second account on this browser still records
    const recorded = new Set((readJSON(RECORDED_KEY) || []).filter((k) => k.startsWith(`${userId}:`)));
    for (const date of dates) {
      for (const game of [...GUESS_GAMES, ...FACEOFF_GAMES]) {
        const key = `${userId}:${game}:${date}`;
        if (recorded.has(key)) continue;
        const row = resultFromProgress(game, date);
        if (!row) continue;
        const { error } = await supabase.from("game_results").insert(row);
        // 23505: already recorded (another tab or device); 42501: outside the
        // accepted date window — either way, don't keep retrying it
        if (!error || error.code === "23505" || error.code === "42501") recorded.add(key);
        else console.error(error);
      }
    }
    try {
      // only recent days matter, so older keys can go
      const keep = [...recorded].filter((k) => dates.some((d) => k.endsWith(`:${d}`)));
      localStorage.setItem(RECORDED_KEY, JSON.stringify(keep));
    } catch (e) {}
  })()
    .catch((e) => console.error(e))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

let awardsInFlight = null;

// Awards the signed-in account has unlocked but hasn't been shown yet (see
// supabase/migrations/0013), marking them as shown. The first check for an
// account marks everything it has already earned as shown and returns
// nothing, so popups start with the next award. Resolves [] when signed out
// or on any error.
export function findNewAwards() {
  if (!mightBeSignedIn()) return Promise.resolve([]);
  if (awardsInFlight) return awardsInFlight;
  awardsInFlight = (async () => {
    const client = await signedInClient();
    if (!client) return [];
    const { supabase, userId } = client;
    const [resultsRes, daysRes, noticesRes] = await Promise.all([
      supabase.from("game_results").select("*").eq("user_id", userId),
      supabase.from("activity_days").select("day").eq("user_id", userId),
      supabase.from("award_notices").select("seen").eq("user_id", userId).maybeSingle(),
    ]);
    const error = resultsRes.error || daysRes.error || noticesRes.error;
    if (error) throw error;
    const unlocked = achievementProgress(
      computeStats(resultsRes.data, todayGameDateString(), daysRes.data.map((r) => r.day))
    ).filter((a) => a.unlocked);

    const seen = noticesRes.data ? new Set(noticesRes.data.seen) : null;
    const fresh = seen ? unlocked.filter((a) => !seen.has(a.id)) : [];
    if (!seen || fresh.length) {
      const ids = (seen ? fresh : unlocked).map((a) => a.id);
      const { error: markError } = await supabase.rpc("mark_awards_seen", { award_ids: ids });
      // not recorded as shown → don't show it now either, or it would pop again
      if (markError) throw markError;
    }
    return fresh;
  })()
    .catch((e) => {
      console.error(e);
      return [];
    })
    .finally(() => {
      awardsInFlight = null;
    });
  return awardsInFlight;
}
