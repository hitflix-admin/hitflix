// Small movie-display primitives shared between the list-builder (App.jsx) and
// anywhere else a movie can be shown with its calculated rating score (e.g. the
// Faceoff games' movie detail popup, MovieModal.jsx).

import { Film } from "lucide-react";

export function calcScore(rating) {
  if (!rating) return null;
  const subTotal = rating.writing + rating.performance + rating.visuals + rating.audio;
  const subFrac = subTotal / 20;
  const overallFrac = rating.overall / 10;
  return Math.round(((subFrac + overallFrac) / 2) * 100);
}

export function ratingColor(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `hsl(${Math.round(t * 120)}, 65%, 48%)`;
}

export function Gauge({ score, size = 44 }) {
  const hasScore = score !== null && score !== undefined;
  const strokeWidth = Math.max(3, size * 0.11);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = hasScore ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const color = hasScore ? ratingColor(score, 0, 100) : "rgba(231,233,236,0.22)";

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
          fontSize: hasScore ? size * (score >= 100 ? 0.27 : 0.32) : size * 0.22,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {hasScore ? (
          <>
            {score}
            <span style={{ fontSize: size * (score >= 100 ? 0.135 : 0.16), marginLeft: 1 }}>%</span>
          </>
        ) : (
          <span style={{ color: "#8D96A3" }}>N/A</span>
        )}
      </div>
    </div>
  );
}

export function PosterArt({ poster, title, size = "thumb" }) {
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
  if (poster) {
    return (
      <img
        src={poster}
        alt={title}
        loading="lazy"
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
        background: "linear-gradient(160deg, #1B2430 0%, #35506B 55%, #7B95BA 130%)",
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
