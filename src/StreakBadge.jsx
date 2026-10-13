// The round streak badge shown in the account button and on the corner of the
// profile card's poster. It starts as a plain, uncolored film strip; color and
// a glow are earned with the account's daily game streak: star (3+ days,
// yellow) → flame (7+, red) → crown (30+, purple).

import React from "react";
import { Film, Flame, Star, Crown } from "lucide-react";

const TIERS = [
  { min: 30, Icon: Crown, glow: "#B76CF5", label: "30+ day streak" },
  { min: 7, Icon: Flame, glow: "#F0564F", label: "7+ day streak" },
  { min: 3, Icon: Star, glow: "#F5C842", label: "3+ day streak" },
  { min: 0, Icon: Film, glow: null, label: null },
];

export function streakTier(days) {
  return TIERS.find((t) => (days || 0) >= t.min);
}

export function streakText(days) {
  if (!days) return "No streak yet";
  return `${days}-day streak`;
}

// neutral look for the un-earned starting tier
const PLAIN_RING = "rgba(231,233,236,0.28)";
const PLAIN_ICON = "#B4BAC3";

export default function StreakBadge({ days, size = 30 }) {
  const tier = streakTier(days);
  const earned = Boolean(tier.glow);
  return (
    <span
      className={earned ? "streak-glow" : undefined}
      title={tier.label || undefined}
      style={{
        "--glow": tier.glow || "transparent",
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        boxSizing: "border-box",
        border: `2px solid ${earned ? tier.glow : PLAIN_RING}`,
        background: "#1E1E1E",
        backgroundImage: earned ? `radial-gradient(circle, ${tier.glow}38 0%, ${tier.glow}14 70%)` : "none",
        color: earned ? tier.glow : PLAIN_ICON,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: earned ? `0 0 ${size * 0.3}px ${tier.glow}99` : "none",
      }}
    >
      <tier.Icon size={size * 0.54} strokeWidth={2.2} color="currentColor" fill={earned ? "currentColor" : "none"} />
    </span>
  );
}
