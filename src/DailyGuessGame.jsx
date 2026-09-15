import React, { useState, useEffect, useCallback } from "react";
import { Search, ArrowLeft, ArrowUp, ArrowDown, Check, Film, Share2, Tag, Lightbulb, Users, Info } from "lucide-react";
import logo from "./assets/hitflix-logo-transparent.png";
import { COLORS, inputStyle, iconBtn, primaryBtn } from "./theme.js";
import { searchWikipediaFilms, fetchMovieDetails, yearFromDescription, normalizeOscarTitle, parseBoxOfficeUSD } from "./movieData.js";
import { todayGameDateString, puzzleNumberForDate, msUntilNextPuzzle, compareGuessToTarget, boxOfficeBracketLabel } from "./dailyMovie.js";
import GameCard from "./GameCard.jsx";
import { preloadOtherGames } from "./gamePreload.js";
import { fetchPrecomputedPuzzle } from "./dailyPuzzleFetch.js";
import MovieModal from "./MovieModal.jsx";

// Same "movieReviews" localStorage shape the list-builder (App.jsx) and
// Faceoff (FaceoffGame.jsx) read and write, keyed by each movie's Wikipedia
// pageid — so a rating left here on today's movie shows up in "Your reviews"
// (and in Faceoff) too, and vice versa.
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

// Give the current game's own first interactions (typing a guess) priority
// over background prefetch requests before starting to warm the other games.
const PRELOAD_DELAY_MS = 2500;

const MAX_GUESSES = 5;
// A hint becomes available once the player has burned all but one guess —
// it's meant as help for the last attempt, not a shortcut through the puzzle.
const HINT_AVAILABLE_AFTER_GUESSES = 4;

// Cast isn't in this list — it's tracked instead by the Matched Cast block up
// top, which already surfaces every overlapping name across all guesses, so a
// per-guess Cast tile here would just be a redundant, noisier view of the same data.
const FIELD_META = [
  { key: "year", label: "Year" },
  { key: "director", label: "Director" },
  { key: "studio", label: "Studio" },
  { key: "runtime", label: "Runtime" },
  { key: "boxOffice", label: "Box Office" },
  { key: "nominations", label: "Oscar Noms" },
];

const EMPTY_PROGRESS = { guesses: [], status: "playing", hintUsed: false };

// Guards against a shape change in compareGuessToTarget's output making old
// cached guesses (from before a field was added/renamed) incompatible.
function isCompatibleProgress(progress) {
  if (!progress || !Array.isArray(progress.guesses)) return false;
  return progress.guesses.every((g) => g?.fields && FIELD_META.every((f) => f.key in g.fields));
}

function loadProgress(storageId, date) {
  try {
    const raw = localStorage.getItem(`${storageId}:progress:${date}`);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw);
    return isCompatibleProgress(parsed) ? parsed : EMPTY_PROGRESS;
  } catch (e) {
    return EMPTY_PROGRESS;
  }
}

function saveProgress(storageId, date, progress) {
  try {
    localStorage.setItem(`${storageId}:progress:${date}`, JSON.stringify(progress));
  } catch (e) {}
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const TILE_EMOJI = { correct: "🟩", full: "🟩", partial: "🟨", wrong: "⬛", none: "⬛", unknown: "⬛" };

function buildShareText(shareLabel, shareUrl, date, guesses, status) {
  const puzzleNum = puzzleNumberForDate(date);
  const lines = guesses.map((g) =>
    FIELD_META.map((f) => TILE_EMOJI[g.fields[f.key].status] || "⬛").join("")
  );
  const result = status === "won" ? `${guesses.length}/${MAX_GUESSES}` : "X/" + MAX_GUESSES;
  return `${shareLabel} #${puzzleNum} ${result}\n\n${lines.join("\n")}\n\n${shareUrl}`;
}

function capitalizeGenre(tag) {
  return tag.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Every cast name shared with the target across all guesses so far, deduped
// case-insensitively (keeping the first-seen casing) so the same actor found
// via two different guesses only shows up once.
function collectMatchedCast(guesses) {
  const seen = new Map();
  for (const g of guesses) {
    for (const name of g.fields?.cast?.shared || []) {
      const key = name.toLowerCase().trim();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return Array.from(seen.values());
}

// A running tally of confirmed cast overlap, built up guess by guess — lets a
// player track who's actually in the mystery movie without having to re-scan
// every past guess card for cast tiles that turned yellow or green.
function MatchedCastBlock({ guesses }) {
  const matched = collectMatchedCast(guesses);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "rgba(92,191,99,0.12)",
        border: "1px solid rgba(92,191,99,0.4)",
        borderRadius: 6,
        padding: "12px 14px",
        marginTop: 10,
      }}
    >
      <Users size={20} strokeWidth={1.8} color={COLORS.fern} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 13.5, lineHeight: 1.4, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: COLORS.fern, marginBottom: matched.length ? 6 : 2 }}>
          Matched cast{matched.length ? ` (${matched.length})` : ""}
        </div>
        {matched.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {matched.map((name) => (
              <span
                key={name}
                style={{
                  background: "rgba(92,191,99,0.18)",
                  border: "1px solid rgba(92,191,99,0.4)",
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ color: COLORS.mute, fontSize: 12.5 }}>
            Cast members from your guesses who are also in today's movie will show up here.
          </div>
        )}
      </div>
    </div>
  );
}

// Shown upfront (before any guess) on both editions — genre is otherwise not
// one of the compared fields, so this is the one hint every version shares.
// Shares a row with the plot-hint button (HintButton below), so it takes no
// margin/width of its own — the row wrapper owns that layout.
function GenreHint({ genreTags }) {
  if (!genreTags || genreTags.length === 0) return null;
  const list = genreTags.slice(0, 3).map(capitalizeGenre).join(", ");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(110,153,212,0.12)",
        border: "1px solid rgba(110,153,212,0.4)",
        borderRadius: 6,
        padding: "12px 14px",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <Tag size={20} strokeWidth={1.8} color={COLORS.cobalt} style={{ flexShrink: 0 }} />
      <div style={{ fontSize: 13.5, lineHeight: 1.4 }}>
        Genre: <span style={{ fontWeight: 700, color: COLORS.cobalt }}>{list}</span>
      </div>
    </div>
  );
}

// Sits beside GenreHint in the same row, always visible so the player knows a
// hint is coming even before it unlocks — it just stays unclickable until the
// guess count reaches HINT_AVAILABLE_AFTER_GUESSES, counting down until then.
function HintButton({ guessCount, status, revealed, onReveal }) {
  const remaining = Math.max(0, HINT_AVAILABLE_AFTER_GUESSES - guessCount);
  const available = status === "playing" && remaining === 0;
  const clickable = available && !revealed;
  return (
    <button
      onClick={clickable ? onReveal : undefined}
      disabled={!clickable}
      title={revealed ? "Hint revealed" : available ? "Show a hint" : `Hint unlocks in ${remaining} more guess${remaining === 1 ? "" : "es"}`}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        background: available ? "rgba(191,148,92,0.12)" : "rgba(231,233,236,0.05)",
        border: `1px solid ${available ? "rgba(191,148,92,0.4)" : "rgba(231,233,236,0.14)"}`,
        borderRadius: 6,
        cursor: clickable ? "pointer" : "default",
        padding: "8px 6px",
      }}
    >
      <Lightbulb size={18} strokeWidth={1.8} color={available ? COLORS.caramel : COLORS.mute} />
      <div style={{ fontSize: 11, fontWeight: 700, color: available ? COLORS.caramel : COLORS.mute, textAlign: "center", lineHeight: 1.2 }}>
        {revealed ? "Hint" : available ? "Hint" : `${remaining} left`}
      </div>
    </button>
  );
}

// The redacted plot beat (no character or cast names) that HintButton
// unlocks — kept separate from the button itself so it can render full-width
// under the genre/hint row once revealed.
function PlotHintText({ plotHint }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(191,148,92,0.12)",
        border: "1px solid rgba(191,148,92,0.4)",
        borderRadius: 6,
        padding: "12px 14px",
        marginTop: 10,
      }}
    >
      <Lightbulb size={20} strokeWidth={1.8} color={COLORS.caramel} style={{ flexShrink: 0 }} />
      <div style={{ fontSize: 13.5, lineHeight: 1.4 }}>{plotHint}</div>
    </div>
  );
}

// Generic engine behind both /daily (any Oscar nominee) and /oscar-winner
// (winners only, with an upfront category hint) — the two differ only in which
// pool the movie is drawn from and a bit of copy, passed in as props.
export default function DailyGuessGame({
  storageId,
  pageTitle,
  heading,
  description,
  shareLabel,
  shareUrl,
  resolveTarget,
  renderHint,
  crossLinks,
}) {
  const date = todayGameDateString();
  const [target, setTarget] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(() => loadProgress(storageId, date));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guessError, setGuessError] = useState("");
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextPuzzle()));
  const [copied, setCopied] = useState(false);
  const [reviews, setReviews] = useState(() => loadReviews());
  const [modalMovie, setModalMovie] = useState(null);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  // ---- load today's target (cached in localStorage so a reload doesn't re-hit Wikipedia) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem(`${storageId}:target:${date}`);
        if (cached) {
          if (!cancelled) setTarget(JSON.parse(cached));
        } else {
          const movie = (await fetchPrecomputedPuzzle(date, storageId)) || (await resolveTarget(date));
          if (cancelled) return;
          setTarget(movie);
          try {
            localStorage.setItem(`${storageId}:target:${date}`, JSON.stringify(movie));
          } catch (e) {}
        }
        // Warm the other games' caches once this one has settled (from cache
        // or freshly resolved either way), after a short delay so it never
        // competes with the player's own first search.
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

  // ---- countdown ticks once the puzzle is over ----
  useEffect(() => {
    if (progress.status === "playing") return;
    const t = setInterval(() => setCountdown(formatCountdown(msUntilNextPuzzle())), 1000);
    return () => clearInterval(t);
  }, [progress.status]);

  // ---- guess search (global Wikipedia, same as the ledger's search) ----
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
          const alreadyGuessed = new Set(progress.guesses.map((g) => normalizeOscarTitle(g.guess.title)));
          setResults(r.filter((m) => !alreadyGuessed.has(normalizeOscarTitle(m.title))));
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
    async (movie) => {
      if (!target || submitting || progress.status !== "playing") return;
      setSubmitting(true);
      setGuessError("");
      setQuery("");
      setResults([]);
      try {
        const details = await fetchMovieDetails(movie.pageTitle, movie.year, movie.title);
        if (!details) {
          setGuessError("Couldn't look up that title — try again.");
          return;
        }
        const guessMovie = {
          title: movie.title,
          poster: movie.poster,
          year: movie.year || yearFromDescription(details.releaseDateUS) || "",
          director: details.director,
          studio: details.studio,
          cast: details.cast,
          runtimeMinutes: details.runtimeMinutes,
          boxOfficeUSD: parseBoxOfficeUSD(details.boxOffice),
          oscarNominations: details.oscarNominations,
        };
        const comparison = compareGuessToTarget(guessMovie, target);
        const nextGuesses = [...progress.guesses, comparison];
        const nextStatus = comparison.isCorrectTitle
          ? "won"
          : nextGuesses.length >= MAX_GUESSES
          ? "lost"
          : "playing";
        const next = { guesses: nextGuesses, status: nextStatus };
        setProgress(next);
        saveProgress(storageId, date, next);
      } finally {
        setSubmitting(false);
      }
    },
    [target, submitting, progress, date, storageId]
  );

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
          <div
            style={{
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: 22,
              letterSpacing: 0.4,
            }}
          >
            {heading}
          </div>
          <div style={{ color: COLORS.mute, fontSize: 13, marginTop: 4 }}>
            {target ? `Puzzle #${puzzleNumberForDate(date)} · ` : ""}
            {description}
          </div>
        </div>

        {loadError && (
          <div style={{ color: COLORS.scarlet, fontSize: 13.5, marginTop: 20 }}>{loadError}</div>
        )}

        {!target && !loadError && (
          <div style={{ color: COLORS.mute, fontSize: 13.5, marginTop: 30 }}>Loading today's puzzle…</div>
        )}

        {target && (
          <>
            <MatchedCastBlock guesses={progress.guesses} />

            {(target.genreTags?.length > 0 || target.plotHint) && (
              <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "stretch" }}>
                {target.genreTags?.length > 0 && (
                  <div style={{ flex: target.plotHint ? "3 1 0%" : "1 1 0%", minWidth: 0 }}>
                    <GenreHint genreTags={target.genreTags} />
                  </div>
                )}
                {target.plotHint && (
                  <div style={{ flex: "1 1 0%", minWidth: 0 }}>
                    <HintButton
                      guessCount={progress.guesses.length}
                      status={progress.status}
                      revealed={!!progress.hintUsed}
                      onReveal={() => {
                        const next = { ...progress, hintUsed: true };
                        setProgress(next);
                        saveProgress(storageId, date, next);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {progress.hintUsed && target.plotHint && <PlotHintText plotHint={target.plotHint} />}
            {renderHint && renderHint(target)}

            <div style={{ display: "flex", gap: 8, margin: "18px 0 6px" }}>
              {Array.from({ length: MAX_GUESSES }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: i < progress.guesses.length ? COLORS.cobalt : "rgba(231,233,236,0.14)",
                  }}
                />
              ))}
            </div>
            <div style={{ color: COLORS.mute, fontSize: 12, marginBottom: 18 }}>
              {progress.status === "playing"
                ? `Guess ${progress.guesses.length + 1} of ${MAX_GUESSES}`
                : progress.status === "won"
                ? `Solved in ${progress.guesses.length} guess${progress.guesses.length === 1 ? "" : "es"}!`
                : "Out of guesses"}
            </div>

            {progress.status === "playing" && (
              <div style={{ marginBottom: 10 }}>
                {/* Scoped to just the icon+input pair — top:50% needs to center
                    against the input's own height, not the taller box below
                    (Searching…/error text/results) that shares this section. */}
                <div style={{ position: "relative" }}>
                  <Search
                    size={16}
                    strokeWidth={1.8}
                    style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: COLORS.mute }}
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Guess any movie…"
                    disabled={submitting}
                    style={{ ...inputStyle, paddingLeft: 34 }}
                  />
                </div>
                {searching && <div style={{ color: COLORS.mute, fontSize: 12.5, marginTop: 6 }}>Searching…</div>}
                {guessError && <div style={{ color: COLORS.scarlet, fontSize: 12.5, marginTop: 6 }}>{guessError}</div>}

                {results.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {results.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => submitGuess(r)}
                        style={{
                          background: COLORS.surface,
                          border: "1px solid rgba(231,233,236,0.08)",
                          borderRadius: 4,
                          padding: "9px 10px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          cursor: submitting ? "default" : "pointer",
                          opacity: submitting ? 0.6 : 1,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.title}
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.description || r.year}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {progress.status !== "playing" && (
              <EndScreen
                status={progress.status}
                target={target}
                countdown={countdown}
                copied={copied}
                onViewMovie={() => setModalMovie(target)}
                onShare={() => {
                  const text = buildShareText(shareLabel, shareUrl, date, progress.guesses, progress.status);
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

            <GuessHistory guesses={progress.guesses} />

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
    </main>
  );
}

function tileStyle(status) {
  const base = {
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 11.5,
    lineHeight: 1.3,
    boxSizing: "border-box",
    // 3 chips per row on any screen width — percentage basis (not a fixed px
    // width) is what keeps this from ever forcing horizontal scroll.
    flex: "1 1 30%",
    minWidth: 0,
  };
  if (status === "correct" || status === "full") {
    return { ...base, background: COLORS.fern, color: "#0d160f", fontWeight: 700 };
  }
  if (status === "partial") {
    return { ...base, background: COLORS.caramel, color: "#1a1405", fontWeight: 700 };
  }
  if (status === "unknown") {
    return { ...base, background: "transparent", border: "1px dashed rgba(231,233,236,0.2)", color: COLORS.mute };
  }
  return { ...base, background: "#2A2A2A", color: COLORS.mute };
}

function FieldTile({ label, field, guessValue }) {
  // Guards against stale localStorage progress from before a field was added/renamed.
  if (!field) field = { status: "unknown", direction: null };
  const arrow =
    field.direction === "up" ? <ArrowUp size={11} strokeWidth={2.5} /> : field.direction === "down" ? <ArrowDown size={11} strokeWidth={2.5} /> : null;
  const isCorrect = field.status === "correct" || field.status === "full";

  return (
    <div style={tileStyle(field.status)}>
      <div style={{ fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.3, opacity: 0.8, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
        {isCorrect && <Check size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
        {arrow}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {field.status === "unknown" ? "?" : guessValue}
        </span>
      </div>
    </div>
  );
}

function guessDisplayValueForField(key, comparison) {
  const raw = comparison.guessRaw || {};
  const field = comparison.fields?.[key];
  // A partial match on a list field (director/studio) is otherwise ambiguous
  // — the raw guessed value doesn't say *which* name overlapped with the
  // target, so show the actual shared name(s) instead.
  if (field?.status === "partial" && field.shared?.length) {
    return field.shared.join(", ");
  }
  switch (key) {
    case "year":
      return raw.year || "?";
    case "director":
      return raw.director || "?";
    case "studio":
      return (raw.studio || []).join(", ") || "?";
    case "runtime":
      return raw.runtime ? `${raw.runtime} min` : "?";
    case "boxOffice":
      return boxOfficeBracketLabel(raw.boxOffice) || "?";
    case "nominations":
      return `${raw.nominations ?? 0} nom${raw.nominations === 1 ? "" : "s"}`;
    default:
      return "?";
  }
}

// One guess's card: a title line plus its 6 category chips, wrapping onto as
// many rows as the screen needs — no fixed-width grid, so it never requires
// horizontal scrolling on narrow phones.
// "First", "Second", "Third"… reads more naturally next to a guess's title
// than a bare "Guess 3" once guesses are listed newest-first and no longer
// line up with their position on the page.
const GUESS_ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth"];
function ordinalGuessLabel(guessNumber) {
  return GUESS_ORDINALS[guessNumber - 1] || `${guessNumber}th`;
}

function GuessRowCard({ title, italic, guessNumber, fields, values }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: "1px solid rgba(231,233,236,0.08)",
        borderRadius: 6,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            fontWeight: italic ? 500 : 700,
            fontStyle: italic ? "italic" : "normal",
            color: italic ? COLORS.mute : COLORS.paper,
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
          title={italic ? undefined : title}
        >
          {title}
        </div>
        {guessNumber && (
          <div style={{ color: COLORS.mute, fontSize: 11, flexShrink: 0 }}>{ordinalGuessLabel(guessNumber)} guess</div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {FIELD_META.map((f) => (
          <FieldTile key={f.key} label={f.label} field={fields[f.key]} guessValue={values[f.key]} />
        ))}
      </div>
    </div>
  );
}

// Shown in place of a guess card before the player has made one — establishes
// the category labels upfront, so it reads as a comparison game immediately
// instead of only becoming clear after the first guess.
function PlaceholderRow() {
  const fields = Object.fromEntries(FIELD_META.map((f) => [f.key, { status: "unknown" }]));
  const values = Object.fromEntries(FIELD_META.map((f) => [f.key, "?"]));
  return <GuessRowCard title="Your guess" italic fields={fields} values={values} />;
}

function GuessHistory({ guesses }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, marginBottom: 8 }}>
      {guesses.length === 0 && (
        <div style={{ color: COLORS.mute, fontSize: 12 }}>
          Each guess is scored against today's answer on these 6 categories.
        </div>
      )}
      {guesses.length === 0 && <PlaceholderRow />}
      {guesses.map((g, i) => ({ g, i })).reverse().map(({ g, i }) => {
        const values = Object.fromEntries(FIELD_META.map((f) => [f.key, guessDisplayValueForField(f.key, g)]));
        return <GuessRowCard key={i} title={g.guess.title} guessNumber={i + 1} fields={g.fields} values={values} />;
      })}
    </div>
  );
}

function EndScreen({ status, target, countdown, copied, onShare, onViewMovie }) {
  return (
    <div
      style={{
        marginTop: 22,
        background: COLORS.surface,
        border: "1px solid rgba(231,233,236,0.1)",
        borderRadius: 6,
        padding: 18,
      }}
    >
      <div
        style={{
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: 16,
          letterSpacing: 0.4,
          marginBottom: 12,
          color: status === "won" ? COLORS.fern : COLORS.scarlet,
        }}
      >
        {status === "won" ? "You got it!" : "Better luck tomorrow"}
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
        {target.poster ? (
          <img
            src={target.poster}
            alt={target.title}
            style={{ width: 76, height: 112, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
          />
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
            {target.year} · Dir. {target.director || "Unknown"}
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
