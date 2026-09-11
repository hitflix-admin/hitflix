import React from "react";
import DailyGuessGame from "./DailyGuessGame.jsx";
import { getDailyMovie } from "./dailyMovie.js";
import { GAME_INFO } from "./GameCard.jsx";

export default function DailyGame() {
  return (
    <DailyGuessGame
      storageId="dailyGame"
      pageTitle="Hitflix — Daily Movie"
      heading="Daily Movie"
      description="Guess the featured movie in 5 tries."
      shareLabel="Hitflix Daily Movie"
      shareUrl="https://hitflix.club/daily"
      resolveTarget={getDailyMovie}
      crossLinks={[GAME_INFO.oscarWinner, GAME_INFO.faceoff, GAME_INFO.nominationsFaceoff]}
    />
  );
}
