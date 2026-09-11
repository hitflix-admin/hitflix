import React from "react";
import { ArrowRight } from "lucide-react";
import { COLORS } from "./theme.js";

// Used both on the homepage's Games section and as the cross-links at the
// bottom of each game page, so every "play this other game" link looks and
// reads the same everywhere.
export default function GameCard({ href, accent, title, description }) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        background: COLORS.surface,
        border: `1px solid ${accent}66`,
        borderRadius: 4,
        padding: "13px 16px",
        textDecoration: "none",
        color: COLORS.paper,
      }}
    >
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
        <div style={{ color: COLORS.mute, fontSize: 12 }}>{description}</div>
      </div>
      <ArrowRight size={18} strokeWidth={2} color={accent} style={{ flexShrink: 0 }} />
    </a>
  );
}

export const GAME_INFO = {
  daily: {
    href: "/daily",
    accent: COLORS.blue,
    title: "Daily Movie",
    description: "Guess today's Oscar-nominated movie in 5 tries — genre is your first clue",
  },
  oscarWinner: {
    href: "/oscar-winner",
    accent: COLORS.amber,
    title: "Daily Movie (Oscar Edition)",
    description: "Guess today's Oscar winner — genre and the category it won are your first clues",
  },
  faceoff: {
    href: "/faceoff",
    accent: COLORS.rose,
    title: "Faceoff",
    description: "Pick the bigger box office hit across 5 head-to-head rounds",
  },
  nominationsFaceoff: {
    href: "/nominations-faceoff",
    accent: COLORS.green,
    title: "Faceoff (Oscars Edition)",
    description: "Pick the movie with more Oscar nominations across 5 head-to-head rounds",
  },
};
