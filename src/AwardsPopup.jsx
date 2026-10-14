// "Award unlocked" popup: lists achievements the signed-in account just
// unlocked (found by findNewAwards in gameResults.js), each with its icon and
// description. ✕ closes it and leaves you where you were; "See all awards"
// opens the profile's Awards tab.

import React, { useState, useCallback } from "react";
import {
  X,
  Clapperboard,
  Target,
  Zap,
  EyeOff,
  Timer,
  Swords,
  Crosshair,
  LayoutGrid,
  Trophy,
  Flame,
  Ticket,
} from "lucide-react";
import { COLORS, secondaryBtn } from "./theme.js";
import { useScrollLock } from "./scrollLock.js";
import { findNewAwards } from "./gameResults.js";

// gameStats.js ACHIEVEMENTS name their icon; this maps the names to icons
export const ACHIEVEMENT_ICONS = { Clapperboard, Target, Zap, EyeOff, Timer, Swords, Crosshair, LayoutGrid, Trophy, Flame, Ticket };

// awards: newly unlocked, waiting to be shown. check() looks for more (call
// it whenever a game finishes or a visit day is recorded); dismiss() clears.
export function useNewAwards() {
  const [awards, setAwards] = useState([]);
  const check = useCallback(() => {
    findNewAwards().then((found) => {
      if (found.length) setAwards((prev) => [...prev, ...found.filter((a) => !prev.some((p) => p.id === a.id))]);
    });
  }, []);
  const dismiss = useCallback(() => setAwards([]), []);
  return { awards, check, dismiss };
}

export function AwardsUnlockedModal({ awards, onClose, onSeeAll }) {
  useScrollLock();
  const many = awards.length > 1;
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
        // above every other popup, including the movie details one (60)
        zIndex: 70,
        padding: 18,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={many ? "Awards unlocked" : "Award unlocked"}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#1E1E1E",
          borderRadius: 8,
          border: `1px solid ${COLORS.caramel}55`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          maxWidth: 380,
          width: "100%",
          maxHeight: "min(600px, 85vh, 100%)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: "22px 20px 20px",
          boxSizing: "border-box",
          fontFamily: "'Montserrat', sans-serif",
          color: "#E7E9EC",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
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
        >
          <X size={17} strokeWidth={2} />
        </button>

        <div
          style={{
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            fontSize: 12,
            color: COLORS.caramel,
            marginBottom: many ? 14 : 16,
            paddingRight: 36,
          }}
        >
          {many ? `${awards.length} awards unlocked` : "Award unlocked"}
        </div>

        {many ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {awards.map((a) => {
              const Icon = ACHIEVEMENT_ICONS[a.icon] || Trophy;
              return (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "#141414",
                    borderRadius: 6,
                    padding: "10px 12px",
                    border: `1px solid ${COLORS.caramel}44`,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${COLORS.caramel}2e`,
                      color: COLORS.caramel,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: COLORS.mute, lineHeight: 1.35 }}>{a.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          (() => {
            const a = awards[0];
            const Icon = ACHIEVEMENT_ICONS[a.icon] || Trophy;
            return (
              <div style={{ textAlign: "center", padding: "4px 6px 2px" }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    margin: "0 auto 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `${COLORS.caramel}2e`,
                    border: `1px solid ${COLORS.caramel}66`,
                    color: COLORS.caramel,
                  }}
                >
                  <Icon size={34} strokeWidth={1.8} />
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    fontSize: 19,
                    marginBottom: 6,
                    overflowWrap: "anywhere",
                  }}
                >
                  {a.title}
                </div>
                <div style={{ fontSize: 13.5, color: COLORS.mute, lineHeight: 1.45 }}>{a.description}</div>
              </div>
            );
          })()
        )}

        <button onClick={onSeeAll} style={{ ...secondaryBtn, width: "100%", marginTop: 18, fontSize: 13.5, padding: "10px 14px" }}>
          See all awards
        </button>
      </div>
    </div>
  );
}
