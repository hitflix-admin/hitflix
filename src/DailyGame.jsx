import React from "react";
import DailyGuessGame from "./DailyGuessGame.jsx";
import { getDailyMovie } from "./dailyMovie.js";

export default function DailyGame() {
  return (
    <DailyGuessGame
      storageId="dailyGame"
      pageTitle="Hitflix — Daily Movie"
      heading="Daily Movie"
      description="Guess the Oscar-nominated mystery movie in 5 tries."
      shareLabel="Hitflix Daily Movie"
      shareUrl="https://hitflix.club/daily"
      resolveTarget={getDailyMovie}
      crossLink={{ href: "/oscar-winner", label: "Play the Oscar Winner edition →" }}
    />
  );
}
