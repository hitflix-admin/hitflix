import React from "react";
import { BadgeCheck } from "lucide-react";
import { COLORS } from "./theme.js";

// Shown on a daily game's end screen when it was played clean (focusTracker.js).
export default function CleanBadge({ label }) {
  return (
    <span
      title="Played start to finish without leaving the game"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px 3px 7px",
        borderRadius: 999,
        border: `1px solid ${COLORS.fern}66`,
        background: `${COLORS.fern}1A`,
        color: COLORS.fern,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <BadgeCheck size={14} strokeWidth={2.2} aria-hidden="true" />
      {label}
    </span>
  );
}
