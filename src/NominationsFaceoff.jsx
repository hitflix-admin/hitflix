import React from "react";
import FaceoffGame from "./FaceoffGame.jsx";
import { getDailyNominationsFaceoff } from "./nominationsFaceoff.js";
import { GAME_INFO } from "./GameCard.jsx";

function formatNominations(n) {
  return `${n} nom${n === 1 ? "" : "s"}`;
}

export default function NominationsFaceoff() {
  return (
    <FaceoffGame
      storageId="nominationsFaceoff"
      pageTitle="Hitflix — Faceoff (Oscar Edition)"
      heading="Faceoff (Oscar Edition)"
      description="Which movie got more Oscar nominations? 5 rounds, similar genres each time."
      shareLabel="Hitflix Faceoff (Oscar Edition)"
      shareUrl="https://hitflix.club/games/faceoff-oscars-edition"
      resolvePairs={getDailyNominationsFaceoff}
      formatValue={formatNominations}
      crossLinks={[GAME_INFO.daily, GAME_INFO.oscarWinner, GAME_INFO.faceoff]}
    />
  );
}
