import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { COLORS } from "./theme.js";
import { todayGameDateString } from "./dailyMovie.js";

// Every game page does a real browser navigation (plain <a href>, no client
// router — see main.jsx picking the page from window.location.pathname once
// at load), so a plain synchronous localStorage read here is always fresh:
// there's no stale-across-navigation case to worry about.
//
// DailyGuessGame stores a "status" that's "playing" until the puzzle ends;
// FaceoffGame stores an "answers" array capped at its round count with no
// separate status field, so a full array is what "done" looks like there.
const FACEOFF_ROUNDS = 5;

function isGameCompletedToday(storageId) {
  try {
    const raw = localStorage.getItem(`${storageId}:progress:${todayGameDateString()}`);
    if (!raw) return false;
    const progress = JSON.parse(raw);
    if (typeof progress.status === "string") return progress.status !== "playing";
    if (Array.isArray(progress.answers)) return progress.answers.length >= FACEOFF_ROUNDS;
    return false;
  } catch (e) {
    return false;
  }
}

// Used both on the homepage's Games section and as the cross-links at the
// bottom of each game page, so every "play this other game" link looks and
// reads the same everywhere — including whether today's puzzle is done.
export default function GameCard({ href, accent, title, description, storageId }) {
  const completed = storageId ? isGameCompletedToday(storageId) : false;
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        background: COLORS.surface,
        border: `1px solid ${completed ? "rgba(231,233,236,0.12)" : accent + "66"}`,
        borderRadius: 4,
        padding: "13px 16px",
        textDecoration: "none",
        color: COLORS.paper,
        opacity: completed ? 0.7 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
          {completed && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: COLORS.fern,
                background: "rgba(92,191,99,0.15)",
                border: `1px solid ${COLORS.fern}55`,
                borderRadius: 20,
                padding: "2px 7px",
                flexShrink: 0,
              }}
            >
              <Check size={10} strokeWidth={3} />
              Played
            </span>
          )}
        </div>
        <div style={{ color: COLORS.mute, fontSize: 12, marginTop: 2 }}>{description}</div>
      </div>
      <ArrowRight size={18} strokeWidth={2} color={completed ? COLORS.mute : accent} style={{ flexShrink: 0 }} />
    </a>
  );
}

export const GAME_INFO = {
  daily: {
    href: "/games/daily",
    accent: COLORS.cobalt,
    title: "Daily Movie",
    description: "Guess today's featured movie in 5 tries — genre is your first clue",
    storageId: "dailyGame",
  },
  oscarWinner: {
    href: "/games/daily-oscar-edition",
    accent: COLORS.caramel,
    title: "Daily Movie (Oscar Edition)",
    description: "Guess today's Oscar winner — genre and the category it won are your first clues",
    storageId: "dailyWinner",
  },
  faceoff: {
    href: "/games/faceoff",
    accent: COLORS.orchid,
    title: "Faceoff",
    description: "Pick the bigger box office hit across 5 head-to-head rounds",
    storageId: "faceoff",
  },
  nominationsFaceoff: {
    href: "/games/faceoff-oscar-edition",
    accent: COLORS.fern,
    title: "Faceoff (Oscar Edition)",
    description: "Pick the movie with more Oscar nominations across 5 head-to-head rounds",
    storageId: "nominationsFaceoff",
  },
};
