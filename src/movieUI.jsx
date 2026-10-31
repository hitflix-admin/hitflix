// Small movie-display primitives shared between the list-builder (App.jsx) and
// anywhere else a movie can be shown with its calculated rating score (e.g. the
// Faceoff games' movie detail popup, MovieModal.jsx).

import { useState } from "react";
import { Film } from "lucide-react";

export function calcScore(rating) {
  if (!rating) return null;
  const subTotal = rating.writing + rating.performance + rating.visuals + rating.audio;
  // ((subTotal/20 + overall/10) / 2) * 100 out of 100, kept in integers until
  // the final halving so it's exact: a whole number or a half (72.5), matching
  // reviews.score in the database. Only the Hitflix score is rounded.
  return (subTotal * 5 + rating.overall * 10) / 2;
}

// Splits the number shown in a Gauge so the decimals can be drawn smaller:
// a personal score out of 10 (82.5 → "8" + ".25"), or the Hitflix score out
// of 100 (68 → "68").
function splitScore(score, outOf) {
  const [whole, decimals] = String(outOf === 10 ? score / 10 : score).split(".");
  return { whole, decimals: decimals ? `.${decimals}` : "" };
}

export function ratingColor(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `hsl(${Math.round(t * 120)}, 65%, 48%)`;
}

// score is always 0–100 (it sets the ring and color); outOf={10} shows a
// personal score out of 10, the default 100 is for the Hitflix score.
export function Gauge({ score, size = 44, outOf = 100 }) {
  const hasScore = score !== null && score !== undefined;
  const strokeWidth = Math.max(3, size * 0.11);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = hasScore ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const color = hasScore ? ratingColor(score, 0, 100) : "rgba(231,233,236,0.22)";
  const parts = hasScore ? splitScore(score, outOf) : null;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(231,233,236,0.12)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.25s ease, stroke 0.25s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          color: "#E7E9EC",
          fontSize: hasScore ? size * (parts.whole.length >= 3 ? 0.27 : 0.32) : size * 0.22,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {hasScore ? (
          <>
            {parts.whole}
            {parts.decimals && <span style={{ fontSize: size * 0.16 }}>{parts.decimals}</span>}
          </>
        ) : (
          <span style={{ color: "#8D96A3" }}>N/A</span>
        )}
      </div>
    </div>
  );
}

// A personal score (0–100) on a movie card: the score out of 10 over a bar
// that fills to it, wide enough to read at phone size (the 34px Gauge wasn't).
export function ScoreBar({ score }) {
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 3,
          fontFamily: "'Montserrat', sans-serif",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 18, color: "#E7E9EC" }}>{score / 10}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#8D96A3" }}>/10</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(231,233,236,0.12)", marginTop: 7 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, score))}%`,
            borderRadius: 3,
            background: ratingColor(score, 0, 100),
            transition: "width 0.25s ease, background 0.25s ease",
          }}
        />
      </div>
    </div>
  );
}

export function PosterArt({ poster, title, size = "thumb" }) {
  const [failed, setFailed] = useState(false);
  const initials = (title || "?")
    .split(" ")
    .filter((w) => w.length && /[A-Za-z0-9]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const dims = size === "thumb" ? { w: 52, h: 76 } : { w: 168, h: 244 };
  const sizeStyle =
    size === "fill"
      ? { width: "100%", height: "auto", aspectRatio: "52 / 76" }
      : { width: dims.w, height: dims.h };
  if (poster && !failed) {
    return (
      <img
        src={poster}
        alt={title}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{
          ...sizeStyle,
          objectFit: "cover",
          borderRadius: 3,
          border: "1px solid rgba(231,233,236,0.14)",
          flexShrink: 0,
          background: "#1E1E1E",
        }}
      />
    );
  }
  return (
    <div
      style={{
        ...sizeStyle,
        borderRadius: 3,
        border: "1px solid rgba(231,233,236,0.14)",
        flexShrink: 0,
        background: "linear-gradient(160deg, #1B2430 0%, #2F527A 55%, #6E99D4 130%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#141414",
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 800,
        fontSize: size === "thumb" ? 16 : 36,
        letterSpacing: 0.5,
      }}
    >
      {initials || <Film size={size === "thumb" ? 16 : 28} strokeWidth={1.5} />}
    </div>
  );
}
