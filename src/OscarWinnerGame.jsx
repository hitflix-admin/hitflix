import React from "react";
import { Trophy } from "lucide-react";
import DailyGuessGame from "./DailyGuessGame.jsx";
import { COLORS } from "./theme.js";
import { getDailyOscarWinner } from "./dailyMovie.js";
import { GAME_INFO } from "./GameCard.jsx";

function WinnerHint({ hintCategory }) {
  if (!hintCategory) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(201,160,61,0.12)",
        border: "1px solid rgba(201,160,61,0.4)",
        borderRadius: 6,
        padding: "12px 14px",
        marginTop: 16,
      }}
    >
      <Trophy size={20} strokeWidth={1.8} color={COLORS.amber} style={{ flexShrink: 0 }} />
      <div style={{ fontSize: 13.5, lineHeight: 1.4 }}>
        This movie won an Oscar for <span style={{ fontWeight: 700, color: COLORS.amber }}>{hintCategory}</span>.
      </div>
    </div>
  );
}

export default function OscarWinnerGame() {
  return (
    <DailyGuessGame
      storageId="dailyWinner"
      pageTitle="Hitflix — Daily Movie (Oscar Edition)"
      heading="Daily Movie (Oscar Edition)"
      description="Guess the Oscar-winning movie in 5 tries."
      shareLabel="Hitflix Daily Movie (Oscar Edition)"
      shareUrl="https://hitflix.club/oscar-winner"
      resolveTarget={getDailyOscarWinner}
      renderHint={(target) => <WinnerHint hintCategory={target.hintCategory} />}
      crossLinks={[GAME_INFO.daily, GAME_INFO.faceoff, GAME_INFO.nominationsFaceoff]}
    />
  );
}
