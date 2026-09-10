import React, { useState, useEffect, useCallback } from "react";
import { Search, ArrowLeft, ArrowUp, ArrowDown, Check, ExternalLink, Film, Share2 } from "lucide-react";
import logo from "./assets/hitflix-logo-transparent.png";
import { COLORS, FONTS, inputStyle, iconBtn, primaryBtn } from "./theme.js";
import { searchWikipediaFilms, fetchMovieDetails, yearFromDescription, normalizeOscarTitle } from "./movieData.js";
import { getDailyMovie, todayUTCDateString, puzzleNumberForDate, msUntilNextPuzzle, compareGuessToTarget } from "./dailyMovie.js";

const MAX_GUESSES = 5;

const FIELD_META = [
  { key: "year", label: "Year" },
  { key: "director", label: "Director" },
  { key: "country", label: "Country" },
  { key: "cast", label: "Cast" },
  { key: "runtime", label: "Runtime" },
  { key: "nominations", label: "Oscar Noms" },
];

function targetKey(date) {
  return `dailyGame:target:${date}`;
}
function progressKey(date) {
  return `dailyGame:progress:${date}`;
}

const EMPTY_PROGRESS = { guesses: [], status: "playing" };

// Guards against a shape change in compareGuessToTarget's output making old
// cached guesses (from before a field was added/renamed) incompatible.
function isCompatibleProgress(progress) {
  if (!progress || !Array.isArray(progress.guesses)) return false;
  return progress.guesses.every((g) => g?.fields && FIELD_META.every((f) => f.key in g.fields));
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

const TILE_EMOJI = { correct: "🟩", full: "🟩", partial: "🟨", wrong: "⬛", none: "⬛", unknown: "⬛" };

function buildShareText(date, guesses, status) {
  const puzzleNum = puzzleNumberForDate(date);
  const lines = guesses.map((g) =>
    FIELD_META.map((f) => TILE_EMOJI[g.fields[f.key].status] || "⬛").join("")
  );
  const result = status === "won" ? `${guesses.length}/${MAX_GUESSES}` : "X/" + MAX_GUESSES;
  return `Hitflix Daily Movie #${puzzleNum} ${result}\n\n${lines.join("\n")}\n\nhttps://hitflix.club/daily`;
}

export default function DailyGame() {
  const date = todayUTCDateString();
  const [target, setTarget] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(() => loadProgress(date));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guessError, setGuessError] = useState("");
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextPuzzle()));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "Hitflix — Daily Movie";
  }, []);

  // ---- load today's target (cached in localStorage so a reload doesn't re-hit Wikipedia) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem(targetKey(date));
        if (cached) {
          if (!cancelled) setTarget(JSON.parse(cached));
          return;
        }
        const movie = await getDailyMovie(date);
        if (cancelled) return;
        setTarget(movie);
        try {
          localStorage.setItem(targetKey(date), JSON.stringify(movie));
        } catch (e) {}
      } catch (e) {
        if (!cancelled) setLoadError("Couldn't load today's puzzle. Check your connection and reload.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

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
          countries: details.countries,
          cast: details.cast,
          runtimeMinutes: details.runtimeMinutes,
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
        saveProgress(date, next);
      } finally {
        setSubmitting(false);
      }
    },
    [target, submitting, progress, date]
  );

  const wrap = {
    fontFamily: "'Montserrat', sans-serif",
    background: COLORS.ink,
    color: COLORS.paper,
    minHeight: "100%",
    width: "100%",
  };

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
          <div
            style={{
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: 22,
              letterSpacing: 0.4,
            }}
          >
            Daily Movie
          </div>
          <div style={{ color: COLORS.mute, fontSize: 13, marginTop: 4 }}>
            {target ? `Puzzle #${puzzleNumberForDate(date)} · ` : ""}
            Guess the Oscar-nominated mystery movie in {MAX_GUESSES} tries.
          </div>
        </div>

        {loadError && (
          <div style={{ color: COLORS.rose, fontSize: 13.5, marginTop: 20 }}>{loadError}</div>
        )}

        {!target && !loadError && (
          <div style={{ color: COLORS.mute, fontSize: 13.5, marginTop: 30 }}>Loading today's puzzle…</div>
        )}

        {target && (
          <>
            <div style={{ display: "flex", gap: 8, margin: "18px 0 6px" }}>
              {Array.from({ length: MAX_GUESSES }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: i < progress.guesses.length ? COLORS.blue : "rgba(231,233,236,0.14)",
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
              <div style={{ position: "relative", marginBottom: 10 }}>
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
                {searching && <div style={{ color: COLORS.mute, fontSize: 12.5, marginTop: 6 }}>Searching…</div>}
                {guessError && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 6 }}>{guessError}</div>}

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

            <GuessHistory guesses={progress.guesses} />

            {progress.status !== "playing" && (
              <EndScreen
                status={progress.status}
                target={target}
                date={date}
                guesses={progress.guesses}
                countdown={countdown}
                copied={copied}
                onShare={() => {
                  const text = buildShareText(date, progress.guesses, progress.status);
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
          </>
        )}
      </div>
    </div>
  );
}

function tileStyle(status) {
  const base = {
    borderRadius: 4,
    padding: "7px 9px",
    fontSize: 11.5,
    lineHeight: 1.3,
    display: "flex",
    alignItems: "center",
    gap: 4,
    minHeight: 34,
  };
  if (status === "correct" || status === "full") {
    return { ...base, background: COLORS.green, color: "#0d160f", fontWeight: 700 };
  }
  if (status === "partial") {
    return { ...base, background: COLORS.amber, color: "#1a1405", fontWeight: 700 };
  }
  if (status === "unknown") {
    return { ...base, background: "transparent", border: "1px dashed rgba(231,233,236,0.2)", color: COLORS.mute };
  }
  return { ...base, background: "#2A2A2A", color: COLORS.mute };
}

function FieldTile({ meta, field, guessValue }) {
  // Guards against stale localStorage progress from before a field was added/renamed.
  if (!field) field = { status: "unknown", direction: null };
  const arrow =
    field.direction === "up" ? <ArrowUp size={12} strokeWidth={2.5} /> : field.direction === "down" ? <ArrowDown size={12} strokeWidth={2.5} /> : null;
  const isCorrect = field.status === "correct" || field.status === "full";

  return (
    <div style={tileStyle(field.status)}>
      {isCorrect && <Check size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
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
  );
}

function guessDisplayValueForField(key, comparison) {
  const raw = comparison.guessRaw || {};
  switch (key) {
    case "year":
      return raw.year || "?";
    case "director":
      return raw.director || "?";
    case "country":
      return (raw.country || []).join(", ") || "?";
    case "cast":
      return (raw.cast || []).slice(0, 2).join(", ") || "?";
    case "runtime":
      return raw.runtime ? `${raw.runtime} min` : "?";
    case "nominations":
      return `${raw.nominations ?? 0} nom${raw.nominations === 1 ? "" : "s"}`;
    default:
      return "?";
  }
}

const GUESS_ROW_COLUMNS = `100px repeat(${FIELD_META.length}, 92px)`;
const GUESS_ROW_MIN_WIDTH = 100 + FIELD_META.length * 92 + FIELD_META.length * 6;

function GuessHistory({ guesses }) {
  if (guesses.length === 0) return null;
  return (
    <div style={{ overflowX: "auto", marginTop: 6, marginBottom: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: GUESS_ROW_MIN_WIDTH }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GUESS_ROW_COLUMNS,
            gap: 6,
            color: COLORS.mute,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          <div />
          {FIELD_META.map((f) => (
            <div key={f.key} style={{ textAlign: "center" }}>
              {f.label}
            </div>
          ))}
        </div>
        {guesses.map((g, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: GUESS_ROW_COLUMNS,
              gap: 6,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: 4,
              }}
              title={g.guess.title}
            >
              {g.guess.title}
            </div>
            {FIELD_META.map((f) => (
              <FieldTile
                key={f.key}
                meta={f}
                field={g.fields[f.key]}
                guessValue={guessDisplayValueForField(f.key, g)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EndScreen({ status, target, countdown, copied, onShare }) {
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
          color: status === "won" ? COLORS.green : COLORS.rose,
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
              background: "linear-gradient(160deg, #1B2430 0%, #35506B 55%, #6C86AB 130%)",
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
          <div style={{ color: COLORS.mute, fontSize: 12.5, marginBottom: 6 }}>
            {target.year} · Dir. {target.director || "Unknown"}
          </div>
          {target.pageUrl && (
            <a
              href={target.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: COLORS.blue, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}
            >
              More on Wikipedia
              <ExternalLink size={11} strokeWidth={2} />
            </a>
          )}
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
