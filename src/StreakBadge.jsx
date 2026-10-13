// The round streak badge shown in the account button and on the corner of the
// profile card's poster. Its icon and glow step up with the account's daily
// game streak: film reel → flame (3+ days, yellow) → star (7+, red) →
// crown (30+, purple).

import React from "react";
import { Flame, Star, Crown } from "lucide-react";
import { COLORS } from "./theme.js";

// lucide has no film reel, so this one's drawn to match its stroke style
function FilmReel({ size = 24, color = "currentColor", strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="6.5" r="2" />
      <circle cx="12" cy="17.5" r="2" />
      <circle cx="6.5" cy="12" r="2" />
      <circle cx="17.5" cy="12" r="2" />
    </svg>
  );
}

const TIERS = [
  { min: 30, Icon: Crown, glow: "#B76CF5", label: "30+ day streak" },
  { min: 7, Icon: Star, glow: "#F0564F", label: "7+ day streak" },
  { min: 3, Icon: Flame, glow: "#F5C842", label: "3+ day streak" },
  { min: 0, Icon: FilmReel, glow: null, label: null },
];

export function streakTier(days) {
  return TIERS.find((t) => (days || 0) >= t.min);
}

export function streakText(days) {
  if (!days) return "No streak yet";
  return `${days}-day streak`;
}

// accent: ring color when there's no streak tier yet (the profile card color)
export default function StreakBadge({ days, size = 30, accent = COLORS.cobalt }) {
  const tier = streakTier(days);
  const ring = tier.glow || accent;
  return (
    <span
      className={tier.glow ? "streak-glow" : undefined}
      title={tier.label || undefined}
      style={{
        "--glow": tier.glow || "transparent",
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        boxSizing: "border-box",
        border: `2px solid ${ring}`,
        background: "#1E1E1E",
        backgroundImage: `radial-gradient(circle, ${ring}38 0%, ${ring}14 70%)`,
        color: tier.glow || accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: tier.glow ? `0 0 ${size * 0.3}px ${tier.glow}99` : "none",
      }}
    >
      <tier.Icon size={size * 0.54} strokeWidth={2.2} color="currentColor" fill={tier.Icon === FilmReel ? undefined : "currentColor"} />
    </span>
  );
}
