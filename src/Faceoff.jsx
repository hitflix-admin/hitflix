import React from "react";
import FaceoffGame from "./FaceoffGame.jsx";
import { getDailyFaceoff } from "./faceoff.js";
import { GAME_INFO } from "./GameCard.jsx";

function formatUSD(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

export default function Faceoff() {
  return (
    <FaceoffGame
      storageId="faceoff"
      pageTitle="Hitflix — Faceoff"
      heading="Faceoff"
      description="Which movie made more at the box office? 5 rounds, similar genres each time."
      shareLabel="Hitflix Faceoff"
      shareUrl="https://hitflix.club/faceoff"
      resolvePairs={getDailyFaceoff}
      formatValue={formatUSD}
      crossLinks={[GAME_INFO.daily, GAME_INFO.oscarWinner, GAME_INFO.nominationsFaceoff]}
    />
  );
}
