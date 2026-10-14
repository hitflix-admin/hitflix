import { useEffect } from "react";

/* ---------------------------------------------------------
   Clean games: a daily game counts as "clean" when the player
   never left it — switched tab or app, locked the screen,
   closed it — for AWAY_LIMIT_MS or more while it was in
   progress. Shorter absences, like glancing at a notification,
   don't count.

   Tracked only in the game's saved progress in this browser
   (never uploaded with game results), and only ever shown as
   the "Clean win" / "Clean game" badge on the end screen.
--------------------------------------------------------- */

export const AWAY_LIMIT_MS = 5000;

// While `active`, watches the page's visibility and records on the game's
// progress: focusTracked (tracking ran for this game), hiddenAt (when the
// page was last hidden, kept so closing and reopening mid-game still
// counts), and awayLong (an absence reached the limit).
// progressRef always holds the latest progress; commit(next) saves it.
export function useFocusTracker(active, progressRef, commit) {
  useEffect(() => {
    if (!active) return;
    const update = (patch) => {
      const next = { ...progressRef.current, ...patch };
      progressRef.current = next;
      commit(next);
    };
    function settle() {
      const { hiddenAt, awayLong } = progressRef.current;
      if (!hiddenAt) return;
      update({ hiddenAt: null, awayLong: awayLong || Date.now() - hiddenAt >= AWAY_LIMIT_MS });
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (!progressRef.current.hiddenAt) update({ hiddenAt: Date.now() });
      } else settle();
    }
    if (!progressRef.current.focusTracked) update({ focusTracked: true });
    // back after closing the tab mid-game
    if (document.visibilityState === "visible") settle();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

// games finished before tracking existed aren't called clean
export const isCleanGame = (progress) => !!progress?.focusTracked && !progress.awayLong;

export const shareMark = (progress) => (progress?.awayLong ? "🎬" : "🍿");
