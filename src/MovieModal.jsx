// The movie detail popup: shows Wikipedia summary/infobox facts and lets the
// player leave or update a star rating. Used by the list-builder (App.jsx) and
// by the Faceoff games (FaceoffGame.jsx), which each own their own rating
// storage but share this same UI and the "movieReviews" localStorage shape.

import { useState, useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import { COLORS, primaryBtn } from "./theme.js";
import { fetchMovieDetails, detailsLookStale } from "./movieData.js";
import { calcScore, ratingColor, Gauge, PosterArt } from "./movieUI.jsx";

const DEFAULT_RATING = { overall: 5, writing: 3, performance: 3, visuals: 3, audio: 3 };
const SUBCATEGORIES = [
  { key: "writing", label: "Writing" },
  { key: "performance", label: "Performance" },
  { key: "visuals", label: "Visuals" },
  { key: "audio", label: "Audio" },
];
const DESCRIPTION_TRUNCATE_LENGTH = 275;

export default function MovieModal({ movie, onClose, onSaveRating, onDetails }) {
  const [expanded, setExpanded] = useState(false);
  const hasExistingRating = !!movie.rating;
  const savedRating = movie.rating || DEFAULT_RATING;
  const [draftRating, setDraftRating] = useState(savedRating);
  const hasChanges = JSON.stringify(draftRating) !== JSON.stringify(savedRating);
  const showValues = hasExistingRating || hasChanges;
  const score = showValues ? calcScore(draftRating) : null;
  const saveButtonLabel = !hasChanges ? "Return to list" : hasExistingRating ? "Update rating" : "Add rating";
  const extract = movie.extract || "";
  const isLong = extract.length > DESCRIPTION_TRUNCATE_LENGTH;
  const shownExtract = expanded || !isLong ? extract : extract.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd() + "…";

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
          maxHeight: "85vh",
          overflowY: "auto",
          padding: 20,
          position: "relative",
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
          <div style={{ paddingTop: 4 }}>
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
            }}
          >
            Your rating
          </div>

          {/* Section 1: total calculated score */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Gauge score={score} size={132} />
          </div>

          {/* Section 2 (overall, left) + Section 3 (subcategories, right) */}
          <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8D96A3" }}>
                <span>Overall</span>
                <span style={{ color: "#E7E9EC", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {showValues ? `${draftRating.overall}/10` : "N/A"}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={draftRating.overall}
                onChange={(e) => setDraftRating((r) => ({ ...r, overall: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
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
                      onChange={(e) => setDraftRating((r) => ({ ...r, [cat.key]: Number(e.target.value) }))}
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
