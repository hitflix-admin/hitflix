import React, { useState, useEffect, useCallback, useRef } from "react";
import { Search, ArrowLeft, Check, X, Film, Share2, Info, Quote } from "lucide-react";
import CleanBadge from "./CleanBadge.jsx";
import { useFocusTracker, isCleanGame, shareMark } from "./focusTracker.js";
import { useNewAwards, AwardsUnlockedModal } from "./AwardsPopup.jsx";
import logo from "./assets/hitflix-logo-transparent.png";
import { COLORS, inputStyle, iconBtn, primaryBtn } from "./theme.js";
import { searchWikipediaFilms, normalizeOscarTitle } from "./movieData.js";
import { todayGameDateString, puzzleNumberForDate, msUntilNextPuzzle } from "./dailyMovie.js";
import GameCard, { GAME_INFO } from "./GameCard.jsx";
import { preloadOtherGames } from "./gamePreload.js";
import { fetchPrecomputedPuzzle } from "./dailyPuzzleFetch.js";
import MovieModal from "./MovieModal.jsx";
import { useGameReviews } from "./gameReviews.js";
import { recordFinishedGames, markActiveToday } from "./gameResults.js";

// "Who am I?": name the movie from a single line of its dialogue. Each wrong
// guess swaps in a more recognizable line, ending on the movie's most iconic
// one. Unlike Daily Movie there's no per-guess scoring — a guess is simply
// right or wrong, and the lines themselves are the only hints.
//
// The puzzle (movie + five lines) only ever comes from today's precomputed
// file (scripts/build-daily-puzzle.mjs): the full quotes file is build-time
// only, too big to ship to every visitor, so unlike the other games there's
// no live fallback to resolve it in the browser.

const STORAGE_ID = "whoAmI";
const MAX_GUESSES = 5;
const PRELOAD_DELAY_MS = 2500;
const SHARE_URL = "https://hitflix.club/games/who-am-i";

const EMPTY_PROGRESS = { guesses: [], status: "playing" };

function isUsablePuzzle(target) {
  return target && target.title && Array.isArray(target.quotes) && target.quotes.length === MAX_GUESSES;
}

function loadProgress(date) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE_ID}:progress:${date}`) || "null");
    return parsed && Array.isArray(parsed.guesses) ? parsed : EMPTY_PROGRESS;
  } catch (e) {
    return EMPTY_PROGRESS;
  }
}

function saveProgress(date, progress) {
  try {
    localStorage.setItem(`${STORAGE_ID}:progress:${date}`, JSON.stringify(progress));
  } catch (e) {}
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// Same Wikipedia article, or the same title within a year — the year check
// keeps a remake that shares the title (Scarface 1932 vs 1983) from counting.
function isCorrectGuess(movie, target) {
  if (movie.id && movie.id === target.id) return true;
  const sameTitle = normalizeOscarTitle(movie.title) === normalizeOscarTitle(target.title);
  return sameTitle && (!movie.year || Math.abs(Number(movie.year) - Number(target.year)) <= 1);
}

function buildShareText(date, progress) {
  const { guesses, status } = progress;
  const squares = Array.from({ length: MAX_GUESSES }, (_, i) =>
    i < guesses.length ? (guesses[i].correct ? "🟩" : "🟥") : "⬛"
  ).join("");
  const headline =
    status === "won"
      ? `🎭 I named the movie in Hitflix Who am I? #${puzzleNumberForDate(date)} on line ${guesses.length}/${MAX_GUESSES}! ${shareMark(progress)}`
      : `💀 Hitflix Who am I? #${puzzleNumberForDate(date)} stumped me (X/${MAX_GUESSES}) ${shareMark(progress)}`;
  return `${headline}\n\n${squares}\n\n${SHARE_URL}`;
}

export default function WhoAmIGame() {
  const date = todayGameDateString();
  const [target, setTarget] = useState(null);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | notReady | error
  const [progress, setProgress] = useState(() => loadProgress(date));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextPuzzle()));
  const [copied, setCopied] = useState(false);
  const { reviews, saveRating, saveDetails } = useGameReviews();
  const [modalMovie, setModalMovie] = useState(null);

  useEffect(() => {
    document.title = "Hitflix — Who am I?";
  }, []);

  // ---- load today's puzzle (cached once seen, so the lines a player started
  // with never change mid-game) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let puzzle = null;
        try {
          puzzle = JSON.parse(localStorage.getItem(`${STORAGE_ID}:target:${date}`) || "null");
        } catch (e) {}
        if (!isUsablePuzzle(puzzle)) {
          puzzle = await fetchPrecomputedPuzzle(date, STORAGE_ID);
          if (isUsablePuzzle(puzzle)) {
            try {
              localStorage.setItem(`${STORAGE_ID}:target:${date}`, JSON.stringify(puzzle));
            } catch (e) {}
          }
        }
        if (cancelled) return;
        if (!isUsablePuzzle(puzzle)) {
          setLoadState("notReady");
          return;
        }
        setTarget(puzzle);
        setLoadState("ready");
        setTimeout(() => {
          if (!cancelled) preloadOtherGames(STORAGE_ID);
        }, PRELOAD_DELAY_MS);
      } catch (e) {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // ---- on-screen play time (for profile stats), same rules as the other games ----
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const activeSinceRef = useRef(null);

  function takeActiveMs() {
    if (activeSinceRef.current === null) return 0;
    const now = Date.now();
    const elapsed = now - activeSinceRef.current;
    activeSinceRef.current = now;
    return elapsed;
  }

  useEffect(() => {
    if (!target || progress.status !== "playing") return;
    function start() {
      if (document.visibilityState === "visible" && activeSinceRef.current === null) activeSinceRef.current = Date.now();
    }
    function pause() {
      const elapsed = takeActiveMs();
      activeSinceRef.current = null;
      if (!elapsed) return;
      const next = { ...progressRef.current, activeMs: (progressRef.current.activeMs || 0) + elapsed };
      progressRef.current = next;
      setProgress(next);
      saveProgress(date, next);
    }
    const onVisibility = () => (document.visibilityState === "visible" ? start() : pause());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
      activeSinceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, progress.status]);

  useFocusTracker(!!target && progress.status === "playing", progressRef, (next) => {
    setProgress(next);
    saveProgress(date, next);
  });

  const newAwards = useNewAwards();
  useEffect(() => {
    Promise.all([markActiveToday(), recordFinishedGames()]).then(newAwards.check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (progress.status === "playing") return;
    const t = setInterval(() => setCountdown(formatCountdown(msUntilNextPuzzle())), 1000);
    return () => clearInterval(t);
  }, [progress.status]);

  // ---- guess search (Wikipedia films, same as Daily Movie) ----
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchWikipediaFilms(query.trim());
        if (!cancelled) {
          const guessed = new Set(progress.guesses.map((g) => g.id || normalizeOscarTitle(g.title)));
          setResults(r.filter((m) => !guessed.has(m.id) && !guessed.has(normalizeOscarTitle(m.title))));
        }
      } catch (e) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const submitGuess = useCallback(
    (movie) => {
      if (!target || progress.status !== "playing") return;
      setQuery("");
      setResults([]);
      const correct = isCorrectGuess(movie, target);
      const guesses = [...progress.guesses, { id: movie.id, title: movie.title, year: movie.year || "", correct }];
      const status = correct ? "won" : guesses.length >= MAX_GUESSES ? "lost" : "playing";
      const next = { ...progress, guesses, status, activeMs: (progress.activeMs || 0) + takeActiveMs() };
      setProgress(next);
      saveProgress(date, next);
      if (status !== "playing") recordFinishedGames().then(newAwards.check);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, progress, date]
  );

  const wrap = {
    fontFamily: "'Montserrat', sans-serif",
    background: COLORS.ink,
    color: COLORS.paper,
    minHeight: "100%",
    width: "100%",
  };

  // the line on screen: one per guess made so far, so a wrong guess moves on
  // to the next (easier) line
  const lineIndex = Math.min(progress.guesses.length, MAX_GUESSES - 1);

  return (
    <main style={wrap}>
      <div style={{ padding: "20px 18px 48px", maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <a href="/" style={iconBtn} aria-label="Back to Hitflix">
            <ArrowLeft size={19} strokeWidth={1.8} />
          </a>
          <img src={logo} alt="Hitflix" style={{ height: 28, width: "auto" }} />
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 22, letterSpacing: 0.4 }}>Who am I?</div>
          <div style={{ color: COLORS.mute, fontSize: 13, marginTop: 4 }}>
            {target ? `Puzzle #${puzzleNumberForDate(date)} · ` : ""}
            Name the movie from one line of dialogue in 5 tries.
          </div>
        </div>

        {loadState === "loading" && (
          <div style={{ color: COLORS.mute, fontSize: 13.5, marginTop: 30 }}>Loading today's puzzle…</div>
        )}
        {loadState === "notReady" && (
          <div style={{ color: COLORS.mute, fontSize: 13.5, lineHeight: 1.5, marginTop: 30 }}>
            Today's lines aren't ready yet. Check back a little later.
          </div>
        )}
        {loadState === "error" && (
          <div style={{ color: COLORS.scarlet, fontSize: 13.5, marginTop: 20 }}>
            Couldn't load today's puzzle. Check your connection and reload.
          </div>
        )}

        {target && (
          <>
            {progress.status === "playing" ? (
              <QuoteCard quote={target.quotes[lineIndex]} lineNumber={lineIndex + 1} />
            ) : (
              <EndScreen
                status={progress.status}
                clean={isCleanGame(progress)}
                target={target}
                countdown={countdown}
                copied={copied}
                onViewMovie={() => setModalMovie(target)}
                onShare={() => {
                  if (!navigator.clipboard?.writeText) return;
                  navigator.clipboard
                    .writeText(buildShareText(date, progress))
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                    .catch(() => {});
                }}
              />
            )}

            <div style={{ display: "flex", gap: 8, margin: "18px 0 6px" }}>
              {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                const g = progress.guesses[i];
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: g ? (g.correct ? COLORS.fern : COLORS.scarlet) : "rgba(231,233,236,0.14)",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ color: COLORS.mute, fontSize: 12, marginBottom: 18 }}>
              {progress.status === "playing"
                ? `Guess ${progress.guesses.length + 1} of ${MAX_GUESSES}`
                : progress.status === "won"
                ? `Solved on line ${progress.guesses.length}!`
                : "Out of guesses"}
            </div>

            {progress.status === "playing" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ position: "relative" }}>
                  <Search
                    size={16}
                    strokeWidth={1.8}
                    style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: COLORS.mute }}
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Which movie is it?"
                    style={{ ...inputStyle, paddingLeft: 34 }}
                  />
                </div>
                {searching && <div style={{ color: COLORS.mute, fontSize: 12.5, marginTop: 6 }}>Searching…</div>}
                {results.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                    {results.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => submitGuess(r)}
                        style={{
                          background: COLORS.surface,
                          border: "1px solid rgba(231,233,236,0.08)",
                          borderRadius: 4,
                          padding: "9px 10px",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.description || r.year}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <GuessHistory guesses={progress.guesses} quotes={target.quotes} />

            <div style={{ marginTop: 26 }}>
              <div style={{ color: COLORS.mute, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>
                More games
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[GAME_INFO.daily, GAME_INFO.oscarWinner, GAME_INFO.faceoff, GAME_INFO.nominationsFaceoff].map((game) => (
                  <GameCard key={game.href} {...game} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {modalMovie && (
        <MovieModal
          movie={{
            ...modalMovie,
            uid: modalMovie.id,
            rating: reviews[modalMovie.id]?.rating,
            details: reviews[modalMovie.id]?.details,
          }}
          onClose={() => setModalMovie(null)}
          onSaveRating={(rating) => saveRating(modalMovie, rating)}
          onDetails={(details) => saveDetails(modalMovie, details)}
        />
      )}
      {newAwards.awards.length > 0 && (
        <AwardsUnlockedModal
          awards={newAwards.awards}
          onClose={newAwards.dismiss}
          onSeeAll={() => (window.location.href = "/?profile=awards")}
        />
      )}
    </main>
  );
}

// The current line, big. The speaker stays hidden until the game ends —
// a character name would be an extra hint.
function QuoteCard({ quote, lineNumber }) {
  return (
    <div
      style={{
        marginTop: 16,
        background: "rgba(92,184,191,0.10)",
        border: "1px solid rgba(92,184,191,0.4)",
        borderRadius: 6,
        padding: "20px 18px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.teal, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
        <Quote size={13} strokeWidth={2.2} />
        Line {lineNumber} of {MAX_GUESSES}
      </div>
      <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.35, overflowWrap: "anywhere" }}>“{quote.line}”</div>
    </div>
  );
}

// Newest first: each guess with the line the player saw when they made it.
function GuessHistory({ guesses, quotes }) {
  if (guesses.length === 0) {
    return (
      <div style={{ color: COLORS.mute, fontSize: 12, lineHeight: 1.5 }}>
        Every wrong guess swaps in an easier line. The last one is the movie's most famous.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      {guesses
        .map((g, i) => ({ g, i }))
        .reverse()
        .map(({ g, i }) => (
          <div
            key={i}
            style={{
              background: COLORS.surface,
              border: `1px solid ${g.correct ? "rgba(92,191,99,0.45)" : "rgba(231,233,236,0.08)"}`,
              borderRadius: 6,
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {g.correct ? (
                <Check size={15} strokeWidth={2.6} color={COLORS.fern} style={{ flexShrink: 0 }} />
              ) : (
                <X size={15} strokeWidth={2.6} color={COLORS.scarlet} style={{ flexShrink: 0 }} />
              )}
              <div style={{ fontWeight: 700, fontSize: 13, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.title}
                {g.year ? <span style={{ color: COLORS.mute, fontWeight: 500 }}> ({g.year})</span> : null}
              </div>
              <div style={{ color: COLORS.mute, fontSize: 11, flexShrink: 0 }}>Line {i + 1}</div>
            </div>
            <div style={{ color: COLORS.mute, fontSize: 12, marginTop: 5, paddingLeft: 23, lineHeight: 1.4 }}>“{quotes[i]?.line}”</div>
          </div>
        ))}
    </div>
  );
}

function EndScreen({ status, clean, target, countdown, copied, onShare, onViewMovie }) {
  return (
    <div style={{ marginTop: 16, background: COLORS.surface, border: "1px solid rgba(231,233,236,0.1)", borderRadius: 6, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 10px", marginBottom: 12 }}>
        <div
          style={{
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: 16,
            letterSpacing: 0.4,
            color: status === "won" ? COLORS.fern : COLORS.scarlet,
          }}
        >
          {status === "won" ? "You got it!" : "Better luck tomorrow"}
        </div>
        {status === "won" && clean && <CleanBadge label="Clean win" />}
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
        {target.poster ? (
          <img src={target.poster} alt={target.title} style={{ width: 76, height: 112, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
        ) : (
          <div
            style={{
              width: 76,
              height: 112,
              borderRadius: 4,
              flexShrink: 0,
              background: "linear-gradient(160deg, #1B2430 0%, #2F527A 55%, #6E99D4 130%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Film size={22} strokeWidth={1.5} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{target.title}</div>
          <div style={{ color: COLORS.mute, fontSize: 12.5, marginBottom: 8 }}>
            {target.year}
            {target.director ? ` · Dir. ${target.director}` : ""}
          </div>
          <button
            onClick={onViewMovie}
            style={{
              background: "none",
              border: "1px solid rgba(231,233,236,0.18)",
              borderRadius: 4,
              color: COLORS.mute,
              fontSize: 11.5,
              fontWeight: 700,
              padding: "6px 10px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            <Info size={12} strokeWidth={2} />
            Movie Info
          </button>
        </div>
      </div>

      {/* all five lines, now with who said them */}
      <div style={{ color: COLORS.mute, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Today's lines
      </div>
      <ol style={{ margin: "0 0 16px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {target.quotes.map((q, i) => (
          <li key={i} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.4 }}>
            <span style={{ color: COLORS.teal, fontWeight: 800, flexShrink: 0, width: 12 }}>{i + 1}</span>
            <span style={{ minWidth: 0 }}>
              “{q.line}”
              {q.speaker ? <span style={{ color: COLORS.mute }}> — {q.speaker}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <button onClick={onShare} style={{ ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Share2 size={15} strokeWidth={2} />
        {copied ? "Copied!" : "Share result"}
      </button>

      <div style={{ color: COLORS.mute, fontSize: 12, marginTop: 14, textAlign: "center" }}>Next puzzle in {countdown}</div>
    </div>
  );
}
