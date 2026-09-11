import React, { useState, useEffect } from "react";
import { ArrowLeft, Film, Check, X, Share2 } from "lucide-react";
import logo from "./assets/hitflix-logo-transparent.png";
import { COLORS, FONTS, iconBtn, primaryBtn } from "./theme.js";
import { todayUTCDateString, puzzleNumberForDate, msUntilNextPuzzle } from "./dailyMovie.js";
import { getDailyFaceoff } from "./faceoff.js";
import GameCard, { GAME_INFO } from "./GameCard.jsx";

const ROUNDS = 5;

function targetKey(date) {
  return `faceoff:target:${date}`;
}
function progressKey(date) {
  return `faceoff:progress:${date}`;
}

const EMPTY_PROGRESS = { answers: [] };

function isCompatibleProgress(progress) {
  if (!progress || !Array.isArray(progress.answers)) return false;
  return progress.answers.every(
    (a) => a && (a.choice === "left" || a.choice === "right") && typeof a.correct === "boolean"
  );
}

function loadProgress(date) {
  try {
    const raw = localStorage.getItem(progressKey(date));
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw);
    return isCompatibleProgress(parsed) ? parsed : EMPTY_PROGRESS;
  } catch (e) {
    return EMPTY_PROGRESS;
  }
}

function saveProgress(date, progress) {
  try {
    localStorage.setItem(progressKey(date), JSON.stringify(progress));
  } catch (e) {}
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatUSD(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
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

function MovieCard({ movie, onClick, disabled, resultState }) {
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
          {formatUSD(movie.grossUSD)}
        </div>
      )}
    </div>
  );
}

export default function Faceoff() {
  const date = todayUTCDateString();
  const [target, setTarget] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(() => loadProgress(date));
  const [justAnswered, setJustAnswered] = useState(null); // { pairIndex, choice, correct } | null
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextPuzzle()));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "Hitflix — Faceoff";
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem(targetKey(date));
        if (cached) {
          if (!cancelled) setTarget(JSON.parse(cached));
          return;
        }
        const pairs = await getDailyFaceoff(date);
        if (cancelled) return;
        setTarget(pairs);
        try {
          localStorage.setItem(targetKey(date), JSON.stringify(pairs));
        } catch (e) {}
      } catch (e) {
        if (!cancelled) setLoadError("Couldn't load today's puzzle. Check your connection and reload.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

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
    const correct = chosen.grossUSD > other.grossUSD;
    const next = { answers: [...progress.answers, { choice: side, correct }] };
    setProgress(next);
    saveProgress(date, next);
    setJustAnswered({ pairIndex, choice: side, correct });
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
      <style>{FONTS}</style>
      <div style={{ padding: "20px 18px 48px", maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <a href="/" style={iconBtn} aria-label="Back to Hitflix">
            <ArrowLeft size={19} strokeWidth={1.8} />
          </a>
          <img src={logo} alt="Hitflix" style={{ height: 28, width: "auto" }} />
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 22, letterSpacing: 0.4 }}>
            Faceoff
          </div>
          <div style={{ color: COLORS.mute, fontSize: 13, marginTop: 4 }}>
            {target ? `Puzzle #${puzzleNumberForDate(date)} · ` : ""}
            Which movie made more at the box office? 5 rounds, similar genres each time.
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
                  : pair.left.grossUSD > pair.right.grossUSD
                  ? "actual-higher"
                  : "faded";
                const rightState = !feedback
                  ? null
                  : feedback.choice === "right"
                  ? feedback.correct
                    ? "chosen-correct"
                    : "chosen-wrong"
                  : pair.right.grossUSD > pair.left.grossUSD
                  ? "actual-higher"
                  : "faded";

                return (
                  <>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <MovieCard
                        movie={pair.left}
                        onClick={() => chooseSide("left")}
                        disabled={!!feedback}
                        resultState={leftState}
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
                date={date}
                answers={progress.answers}
                target={target}
                score={score}
                percent={percent}
                countdown={countdown}
                copied={copied}
                onShare={() => {
                  const lines = progress.answers.map((a) => (a.correct ? "✅" : "❌")).join("");
                  const text = `Hitflix Faceoff #${puzzleNumberForDate(date)} ${score}/${ROUNDS}\n\n${lines}\n\nhttps://hitflix.club/faceoff`;
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

            <div style={{ marginTop: 26 }}>
              <div style={{ color: COLORS.mute, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>
                More games
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <GameCard {...GAME_INFO.daily} />
                <GameCard {...GAME_INFO.oscarWinner} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FaceoffEndScreen({ answers, target, score, percent, countdown, copied, onShare }) {
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
          const winner = pair.left.grossUSD > pair.right.grossUSD ? pair.left : pair.right;
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
              <div style={{ color: COLORS.mute, flexShrink: 0 }}>{formatUSD(winner.grossUSD)}</div>
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
