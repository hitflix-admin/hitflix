// The movie detail popup: shows Wikipedia summary/infobox facts and lets the
// player leave or update a star rating. Used by the list-builder (App.jsx) and
// by the Faceoff games (FaceoffGame.jsx), which each own their own rating
// storage but share this same UI and the "movieReviews" localStorage shape.

import { useState, useEffect } from "react";
import { X, ExternalLink, Info, RotateCcw } from "lucide-react";
import { COLORS, primaryBtn } from "./theme.js";
import { fetchMovieDetails, detailsLookStale } from "./movieData.js";
import { calcScore, ratingColor, Gauge, PosterArt } from "./movieUI.jsx";
import { useScrollLock } from "./scrollLock.js";
import { loadHitflixScores } from "./hitflixScore.js";
import { supabase } from "./supabase.js";
import HitflixScoreInfo from "./HitflixScoreInfo.jsx";

const DEFAULT_RATING = { overall: 5, writing: 3, performance: 3, visuals: 3, audio: 3 };
const SUBCATEGORIES = [
  { key: "writing", label: "Writing" },
  { key: "audio", label: "Audio" },
  { key: "visuals", label: "Visuals" },
  { key: "performance", label: "Performances" },
];
const DESCRIPTION_TRUNCATE_LENGTH = 275;

// The ⓘ next to "Hitflix score" and "Your rating": opens HitflixScoreInfo.
function ScoreInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="How the Hitflix Score works"
      style={{
        background: "none",
        border: "none",
        padding: 4,
        margin: -4,
        color: COLORS.caramel,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
      }}
    >
      <Info size={15} strokeWidth={2.2} />
    </button>
  );
}

// What each Reaction score (the overall slider) means. 0 is no longer
// offered; a rating saved as 0 before then reads as 1.
const REACTION_LABELS = {
  1: "Couldn't finish it",
  2: "Really bad",
  3: "Lots of issues",
  4: "Below average",
  5: "Average",
  6: "Some good moments",
  7: "Enjoyed it",
  8: "Highly recommend",
  9: "Loved it",
  10: "Incredible",
};
const reactionLabel = (overall) => REACTION_LABELS[Math.max(1, overall)];

// "The Craft" / "The Reaction" heading over each half of Your rating
const partLabel = {
  fontSize: 11.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: COLORS.caramel,
  marginBottom: 2,
};

// onSignIn opens sign-in; without it (the game pages), Sign in goes to the
// home page with its sign-in popup open (/?signin=1).
export default function MovieModal({ movie, onClose, onSaveRating, onDetails, onSignIn }) {
  useScrollLock();
  const [expanded, setExpanded] = useState(false);
  const hasExistingRating = !!movie.rating;
  const savedRating = movie.rating || DEFAULT_RATING;
  const [draftRating, setDraftRating] = useState(savedRating);
  // Once any slider is touched, an unrated movie counts as rated, even if
  // every slider is left at its starting value (5/10, 3/5).
  const [touched, setTouched] = useState(false);
  const touch = () => setTouched(true);
  const hasChanges = JSON.stringify(draftRating) !== JSON.stringify(savedRating) || (!hasExistingRating && touched);
  const showValues = hasExistingRating || hasChanges;
  const score = showValues ? calcScore(draftRating) : null;
  const reactionColor = ratingColor(draftRating.overall, 1, 10);
  const saveButtonLabel = !hasChanges ? "Return to list" : hasExistingRating ? "Update rating" : "Add rating";
  const extract = movie.extract || "";
  const isLong = extract.length > DESCRIPTION_TRUNCATE_LENGTH;
  const shownExtract = expanded || !isLong ? extract : extract.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd() + "…";
  // undefined = loading, null = not enough ratings yet, "error" = couldn't load
  const [hitflixScore, setHitflixScore] = useState(undefined);
  const [showScoreInfo, setShowScoreInfo] = useState(false);

  // null until known; signed-out ratings stay in this browser and don't
  // count toward the Hitflix score, so those players get a sign-in prompt
  const [signedIn, setSignedIn] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setHitflixScore(undefined);
    loadHitflixScores([movie.id]).then(
      (scores) => !cancelled && setHitflixScore(String(movie.id) in scores ? scores[movie.id] : "error"),
      () => !cancelled && setHitflixScore("error")
    );
    return () => {
      cancelled = true;
    };
  }, [movie.id]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data?.session));
  }, []);

  useEffect(() => {
    if (movie.details && !detailsLookStale(movie.details)) return;
    let cancelled = false;
    (async () => {
      const details = await fetchMovieDetails(movie.pageTitle || movie.title, movie.year, movie.title);
      if (!cancelled && details) onDetails(details);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.uid]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          borderRadius: 6,
          border: "1px solid rgba(231,233,236,0.1)",
          maxWidth: 420,
          width: "100%",
          maxHeight: "min(85vh, 100%)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: 20,
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "rgba(20,20,20,0.6)",
            border: "none",
            borderRadius: "50%",
            width: 30,
            height: 30,
            color: "#E7E9EC",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Close"
        >
          <X size={17} strokeWidth={2} />
        </button>

        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <PosterArt poster={movie.poster} title={movie.title} size="large" />
          <div style={{ paddingTop: 26, minWidth: 0 }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, textTransform: "uppercase", fontSize: 19, letterSpacing: 0.3, lineHeight: 1.15, marginBottom: 6 }}>
              {movie.title}
            </div>
            {!movie.details || detailsLookStale(movie.details) ? (
              <div style={{ color: "#8D96A3", fontSize: 12.5 }}>Loading details…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {[
                  ["Release Date", movie.details.releaseDateUS],
                  ["Director", movie.details.director],
                  ["Budget", movie.details.budget],
                  ["Box Office", movie.details.boxOffice],
                  ["Oscar Nominations", movie.details.oscarNominations ?? "TBD"],
                  [
                    "Oscar Winners",
                    movie.details.oscarWinners === null
                      ? "TBD"
                      : movie.details.oscarWinners.length === 0
                      ? "None"
                      : movie.details.oscarWinners.join(", "),
                  ],
                ].map(([label, value]) => (
                  <div key={label} style={{ fontSize: 12, color: "#8D96A3", lineHeight: 1.4 }}>
                    <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{label}:</span> {value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {extract && (
          <div style={{ color: "#E7E9EC", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14 }}>
            {shownExtract}
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.cobalt,
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: 0,
                  marginLeft: 6,
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
            {expanded && movie.pageUrl && (
              <div style={{ marginTop: 8 }}>
                <a
                  href={movie.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: COLORS.cobalt,
                    fontSize: 12.5,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    textDecoration: "none",
                  }}
                >
                  More on Wikipedia
                  <ExternalLink size={12} strokeWidth={2} />
                </a>
              </div>
            )}
          </div>
        )}

        {supabase && hitflixScore !== "error" && (
          <div
            style={{
              borderTop: "1px solid rgba(231,233,236,0.1)",
              marginTop: 4,
              paddingTop: 14,
              paddingBottom: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              minHeight: 56,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  fontSize: 13,
                  letterSpacing: 0.5,
                  color: "#8D96A3",
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Hitflix score
                <ScoreInfoButton onClick={() => setShowScoreInfo(true)} />
              </div>
              <div style={{ fontSize: 12.5, color: "#AEB5BF", lineHeight: 1.45 }}>
                The Hitflix Score blends the craft with the reaction, so you know what to expect before you sit down.
              </div>
              {hitflixScore !== undefined && hitflixScore !== null ? null : (
                <div style={{ fontSize: 12, color: "#8D96A3", lineHeight: 1.4, marginTop: 4, fontStyle: "italic" }}>
                  {hitflixScore === undefined ? "Loading…" : "Not enough ratings yet"}
                </div>
              )}
            </div>
            {typeof hitflixScore === "number" && <Gauge score={hitflixScore} size={56} />}
          </div>
        )}
        {showScoreInfo && <HitflixScoreInfo onClose={() => setShowScoreInfo(false)} />}

        <div
          style={{
            borderTop: "1px solid rgba(231,233,236,0.1)",
            marginTop: 4,
            marginBottom: 14,
            paddingTop: 16,
          }}
        >
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: 13,
              letterSpacing: 0.5,
              color: "#8D96A3",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              minHeight: 24, // room for Reset, so the heading doesn't jump
            }}
          >
            Your rating
            <ScoreInfoButton onClick={() => setShowScoreInfo(true)} />
            {hasChanges && (
              <button
                onClick={() => {
                  setDraftRating(savedRating);
                  setTouched(false);
                }}
                aria-label={hasExistingRating ? "Undo changes to your rating" : "Reset your rating"}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "1px solid rgba(231,233,236,0.18)",
                  borderRadius: 999,
                  padding: "3px 10px",
                  color: "#AEB5BF",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <RotateCcw size={12} strokeWidth={2.4} />
                Reset
              </button>
            )}
          </div>

          {signedIn === false && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "rgba(231,233,236,0.05)",
                border: "1px solid rgba(231,233,236,0.1)",
                borderRadius: 6,
                padding: "10px 12px",
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12.5, color: "#E7E9EC", lineHeight: 1.4 }}>
                Sign in so your rating counts toward the Hitflix score
              </div>
              <button
                onClick={() => {
                  if (hasChanges) onSaveRating(draftRating);
                  if (onSignIn) onSignIn();
                  else window.location.href = "/?signin=1";
                }}
                style={{ ...primaryBtn, flex: "none", padding: "8px 14px", fontSize: 12.5, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Sign in
              </button>
            </div>
          )}

          {/* Section 1: total calculated score */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Gauge score={score} size={132} outOf={10} />
          </div>

          {/* Section 2 (overall, left) + Section 3 (subcategories, right) */}
          <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={partLabel}>The Reaction</div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 44,
                    fontWeight: 800,
                    lineHeight: 1,
                    color: showValues ? reactionColor : "#4a525c",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {showValues ? draftRating.overall : "–"}
                </div>
                <div style={{ fontSize: 12, color: "#8D96A3", marginTop: 2 }}>/10</div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: showValues ? "#E7E9EC" : "#8D96A3",
                    margin: "8px 0 10px",
                    minHeight: 18,
                  }}
                >
                  {showValues ? reactionLabel(draftRating.overall) : "How did it make you feel?"}
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={Math.max(1, draftRating.overall)}
                  onChange={(e) => {
                    touch();
                    setDraftRating((r) => ({ ...r, overall: Number(e.target.value) }));
                  }}
                  onPointerDown={touch}
                  onKeyDown={touch}
                  aria-label="Your reaction, out of 10"
                  aria-valuetext={showValues ? `${draftRating.overall} out of 10, ${reactionLabel(draftRating.overall)}` : undefined}
                  style={{ width: "100%", accentColor: showValues ? reactionColor : "#4a525c" }}
                />
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "#6B737E",
                    marginTop: 2,
                  }}
                >
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={partLabel}>The Craft</div>
              {SUBCATEGORIES.map((cat) => {
                const value = draftRating[cat.key];
                const color = showValues ? ratingColor(value, 1, 5) : "#4a525c";
                return (
                  <div key={cat.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8D96A3" }}>
                      <span>{cat.label}</span>
                      <span style={{ color: showValues ? color : "#8D96A3", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {showValues ? `${value}/5` : "N/A"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={value}
                      onChange={(e) => {
                        touch();
                        setDraftRating((r) => ({ ...r, [cat.key]: Number(e.target.value) }));
                      }}
                      onPointerDown={touch}
                      onKeyDown={touch}
                      style={{ width: "100%", accentColor: color }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            if (hasChanges) onSaveRating(draftRating);
            onClose();
          }}
          style={{ ...primaryBtn, width: "100%", marginTop: 18 }}
        >
          {saveButtonLabel}
        </button>
      </div>
    </div>
  );
}
