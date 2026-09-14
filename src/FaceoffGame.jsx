import React, { useState, useEffect } from "react";
import { ArrowLeft, Film, Check, X, Share2, Info } from "lucide-react";
import logo from "./assets/hitflix-logo-transparent.png";
import { COLORS, iconBtn, primaryBtn } from "./theme.js";
import { todayGameDateString, puzzleNumberForDate, msUntilNextPuzzle } from "./dailyMovie.js";
import GameCard from "./GameCard.jsx";
import { preloadOtherGames } from "./gamePreload.js";
import { fetchPrecomputedPuzzle } from "./dailyPuzzleFetch.js";
import MovieModal from "./MovieModal.jsx";

// Same "movieReviews" localStorage shape the list-builder (App.jsx) reads and
// writes, keyed by each movie's Wikipedia pageid — so a rating left here on a
// Faceoff round shows up in "Your reviews" too, and vice versa.
const REVIEWS_STORAGE_KEY = "movieReviews";

function loadReviews() {
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveReviewsToStorage(reviews) {
  try {
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  } catch (e) {}
}

const ROUNDS = 5;
// Give the current game's own resolution priority over background prefetch
// requests before starting to warm the other games.
const PRELOAD_DELAY_MS = 2500;

function targetKey(storageId, date) {
  return `${storageId}:target:${date}`;
}
function progressKey(storageId, date) {
  return `${storageId}:progress:${date}`;
}

const EMPTY_PROGRESS = { answers: [] };

function isCompatibleProgress(progress) {
  if (!progress || !Array.isArray(progress.answers)) return false;
  return progress.answers.every(
    (a) => a && (a.choice === "left" || a.choice === "right") && typeof a.correct === "boolean"
  );
}

function loadProgress(storageId, date) {
  try {
    const raw = localStorage.getItem(progressKey(storageId, date));
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw);
    return isCompatibleProgress(parsed) ? parsed : EMPTY_PROGRESS;
  } catch (e) {
    return EMPTY_PROGRESS;
  }
}

function saveProgress(storageId, date, progress) {
  try {
    localStorage.setItem(progressKey(storageId, date), JSON.stringify(progress));
  } catch (e) {}
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function MoviePoster({ poster, title }) {
  return poster ? (
    <img
      src={poster}
      alt={title}
      style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 4, display: "block" }}
    />
  ) : (
    <div
      style={{
        width: "100%",
        aspectRatio: "2 / 3",
        borderRadius: 4,
        background: "linear-gradient(160deg, #1B2430 0%, #35506B 55%, #6C86AB 130%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Film size={26} strokeWidth={1.5} />
    </div>
  );
}

function MovieCard({ movie, onClick, disabled, resultState, formatValue, onViewMovie }) {
  // resultState: null while choosing; otherwise "chosen-correct" | "chosen-wrong" | "actual-higher" | "faded"
  const borderColor =
    resultState === "chosen-correct"
      ? COLORS.green
      : resultState === "chosen-wrong"
      ? COLORS.rose
      : resultState === "actual-higher"
      ? COLORS.amber
      : "rgba(231,233,236,0.1)";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        flex: 1,
        minWidth: 0,
        background: COLORS.surface,
        border: `2px solid ${borderColor}`,
        borderRadius: 6,
        padding: 10,
        cursor: disabled ? "default" : "pointer",
        opacity: resultState === "faded" ? 0.55 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <MoviePoster poster={movie.poster} title={movie.title} />
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginTop: 8,
          lineHeight: 1.25,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {movie.title}
      </div>
      <div style={{ color: COLORS.mute, fontSize: 11.5, marginTop: 2 }}>{movie.year}</div>
      {resultState && resultState !== "faded" && (
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            fontWeight: 800,
            color: borderColor,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {resultState === "chosen-correct" && <Check size={14} strokeWidth={2.5} />}
          {resultState === "chosen-wrong" && <X size={14} strokeWidth={2.5} />}
          {formatValue(movie.value)}
        </div>
      )}
      {resultState && onViewMovie && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewMovie(movie);
          }}
          style={{
            marginTop: 8,
            width: "100%",
            background: "none",
            border: "1px solid rgba(231,233,236,0.18)",
            borderRadius: 4,
            color: COLORS.mute,
            fontSize: 11.5,
            fontWeight: 700,
            padding: "6px 4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          <Info size={12} strokeWidth={2} />
          Movie Info
        </button>
      )}
    </div>
  );
}

// Generic engine behind every Faceoff variant — box office (Faceoff.jsx) and
// Oscar nominations (NominationsFaceoff.jsx) differ only in which pairs get
// resolved and how the compared value is displayed, passed in as props.
export default function FaceoffGame({
  storageId,
  pageTitle,
  heading,
  description,
  shareLabel,
  shareUrl,
  resolvePairs,
  formatValue,
  crossLinks,
}) {
  const date = todayGameDateString();
  const [target, setTarget] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(() => loadProgress(storageId, date));
  const [justAnswered, setJustAnswered] = useState(null); // { pairIndex, choice, correct } | null
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextPuzzle()));
  const [copied, setCopied] = useState(false);
  const [reviews, setReviews] = useState(() => loadReviews());
  const [modalMovie, setModalMovie] = useState(null);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem(targetKey(storageId, date));
        if (cached) {
          if (!cancelled) setTarget(JSON.parse(cached));
        } else {
          const pairs = (await fetchPrecomputedPuzzle(date, storageId)) || (await resolvePairs(date));
          if (cancelled) return;
          setTarget(pairs);
          try {
            localStorage.setItem(targetKey(storageId, date), JSON.stringify(pairs));
          } catch (e) {}
        }
        // Warm the other games' caches once this one has settled (from cache
        // or freshly resolved either way), after a short delay so it never
        // competes with this game's own resolution or the player's first tap.
        setTimeout(() => {
          if (!cancelled) preloadOtherGames(storageId);
        }, PRELOAD_DELAY_MS);
      } catch (e) {
        if (!cancelled) setLoadError("Couldn't load today's puzzle. Check your connection and reload.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, storageId]);

  const done = progress.answers.length >= ROUNDS;

  useEffect(() => {
    if (!done) return;
    const t = setInterval(() => setCountdown(formatCountdown(msUntilNextPuzzle())), 1000);
    return () => clearInterval(t);
  }, [done]);

  function chooseSide(side) {
    if (!target || justAnswered || done) return;
    const pairIndex = progress.answers.length;
    const pair = target[pairIndex];
    const chosen = pair[side];
    const other = pair[side === "left" ? "right" : "left"];
    const correct = chosen.value > other.value;
    const next = { answers: [...progress.answers, { choice: side, correct }] };
    setProgress(next);
    saveProgress(storageId, date, next);
    setJustAnswered({ pairIndex, choice: side, correct });
  }

  function saveRating(movie, rating) {
    setReviews((prev) => {
      const next = { ...prev, [movie.id]: { ...prev[movie.id], rating, movie } };
      saveReviewsToStorage(next);
      return next;
    });
  }

  function saveDetails(movie, details) {
    setReviews((prev) => {
      const next = { ...prev, [movie.id]: { ...prev[movie.id], details } };
      saveReviewsToStorage(next);
      return next;
    });
  }

  const wrap = {
    fontFamily: "'Montserrat', sans-serif",
    background: COLORS.ink,
    color: COLORS.paper,
    minHeight: "100%",
    width: "100%",
  };

  const score = progress.answers.filter((a) => a.correct).length;
  const percent = Math.round((score / ROUNDS) * 100);

  return (
    <div style={wrap}>
      <div style={{ padding: "20px 18px 48px", maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <a href="/" style={iconBtn} aria-label="Back to Hitflix">
            <ArrowLeft size={19} strokeWidth={1.8} />
          </a>
          <img src={logo} alt="Hitflix" style={{ height: 28, width: "auto" }} />
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 22, letterSpacing: 0.4 }}>
            {heading}
          </div>
          <div style={{ color: COLORS.mute, fontSize: 13, marginTop: 4 }}>
            {target ? `Puzzle #${puzzleNumberForDate(date)} · ` : ""}
            {description}
          </div>
        </div>

        {loadError && <div style={{ color: COLORS.rose, fontSize: 13.5, marginTop: 20 }}>{loadError}</div>}

        {!target && !loadError && (
          <div style={{ color: COLORS.mute, fontSize: 13.5, marginTop: 30 }}>Loading today's puzzle…</div>
        )}

        {target && (
          <>
            <div style={{ display: "flex", gap: 8, margin: "18px 0 6px" }}>
              {Array.from({ length: ROUNDS }).map((_, i) => {
                const answer = progress.answers[i];
                const color = answer
                  ? answer.correct
                    ? COLORS.green
                    : COLORS.rose
                  : "rgba(231,233,236,0.14)";
                return <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: color }} />;
              })}
            </div>

            {!done && (
              <div style={{ color: COLORS.mute, fontSize: 12, marginBottom: 18 }}>
                Round {(justAnswered ? justAnswered.pairIndex : progress.answers.length) + 1} of {ROUNDS}
              </div>
            )}

            {!done &&
              (() => {
                // While showing feedback for a just-answered round, progress.answers
                // has already advanced past it — so pin the displayed round to the one
                // the feedback is actually for, not to progress.answers.length.
                const pairIndex = justAnswered ? justAnswered.pairIndex : progress.answers.length;
                const pair = target[pairIndex];
                const feedback = justAnswered && justAnswered.pairIndex === pairIndex ? justAnswered : null;

                const leftState = !feedback
                  ? null
                  : feedback.choice === "left"
                  ? feedback.correct
                    ? "chosen-correct"
                    : "chosen-wrong"
                  : pair.left.value > pair.right.value
                  ? "actual-higher"
                  : "faded";
                const rightState = !feedback
                  ? null
                  : feedback.choice === "right"
                  ? feedback.correct
                    ? "chosen-correct"
                    : "chosen-wrong"
                  : pair.right.value > pair.left.value
                  ? "actual-higher"
                  : "faded";

                return (
                  <>
                    {/* stretch (not flex-start) so both cards match height even when one
                        title wraps to more lines than the other */}
                    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                      <MovieCard
                        movie={pair.left}
                        onClick={() => chooseSide("left")}
                        disabled={!!feedback}
                        resultState={leftState}
                        formatValue={formatValue}
                        onViewMovie={setModalMovie}
                      />
                      <div
                        style={{
                          alignSelf: "center",
                          fontWeight: 800,
                          fontSize: 13,
                          color: COLORS.mute,
                          flexShrink: 0,
                        }}
                      >
                        VS
                      </div>
                      <MovieCard
                        movie={pair.right}
                        onClick={() => chooseSide("right")}
                        disabled={!!feedback}
                        resultState={rightState}
                        formatValue={formatValue}
                        onViewMovie={setModalMovie}
                      />
                    </div>

                    {feedback && (
                      <div style={{ marginTop: 16 }}>
                        <div
                          style={{
                            textAlign: "center",
                            fontWeight: 800,
                            fontSize: 15,
                            marginBottom: 12,
                            color: feedback.correct ? COLORS.green : COLORS.rose,
                          }}
                        >
                          {feedback.correct ? "Correct!" : "Not quite"}
                        </div>
                        <button
                          onClick={() => setJustAnswered(null)}
                          style={{ ...primaryBtn, width: "100%" }}
                        >
                          {pairIndex + 1 >= ROUNDS ? "See your score" : "Next round"}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}

            {done && (
              <FaceoffEndScreen
                answers={progress.answers}
                target={target}
                score={score}
                percent={percent}
                countdown={countdown}
                copied={copied}
                formatValue={formatValue}
                onShare={() => {
                  const lines = progress.answers.map((a) => (a.correct ? "✅" : "❌")).join("");
                  const text = `${shareLabel} #${puzzleNumberForDate(date)} ${score}/${ROUNDS}\n\n${lines}\n\n${shareUrl}`;
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard
                      .writeText(text)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      })
                      .catch(() => {});
                  }
                }}
              />
            )}

            {crossLinks && crossLinks.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <div style={{ color: COLORS.mute, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>
                  More games
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {crossLinks.map((game) => (
                    <GameCard key={game.href} {...game} />
                  ))}
                </div>
              </div>
            )}
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
    </div>
  );
}

function FaceoffEndScreen({ answers, target, score, percent, countdown, copied, formatValue, onShare }) {
  return (
    <div
      style={{
        marginTop: 18,
        background: COLORS.surface,
        border: "1px solid rgba(231,233,236,0.1)",
        borderRadius: 6,
        padding: 18,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{percent}%</div>
        <div style={{ color: COLORS.mute, fontSize: 13, marginTop: 6 }}>
          {score} of {answers.length} correct
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {answers.map((a, i) => {
          const pair = target[i];
          const winner = pair.left.value > pair.right.value ? pair.left : pair.right;
          const loser = winner === pair.left ? pair.right : pair.left;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12.5,
                padding: "6px 0",
                borderBottom: i < answers.length - 1 ? "1px solid rgba(231,233,236,0.08)" : "none",
              }}
            >
              {a.correct ? (
                <Check size={16} strokeWidth={2.5} color={COLORS.green} style={{ flexShrink: 0 }} />
              ) : (
                <X size={16} strokeWidth={2.5} color={COLORS.rose} style={{ flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 700 }}>{winner.title}</span>
                <span style={{ color: COLORS.mute }}> beat {loser.title}</span>
              </div>
              <div style={{ color: COLORS.mute, flexShrink: 0 }}>{formatValue(winner.value)}</div>
            </div>
          );
        })}
      </div>

      <button onClick={onShare} style={{ ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Share2 size={15} strokeWidth={2} />
        {copied ? "Copied!" : "Share result"}
      </button>

      <div style={{ color: COLORS.mute, fontSize: 12, marginTop: 14, textAlign: "center" }}>
        Next puzzle in {countdown}
      </div>
    </div>
  );
}
