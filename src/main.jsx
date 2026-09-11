import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import DailyGame from "./DailyGame.jsx";
import OscarWinnerGame from "./OscarWinnerGame.jsx";
import Faceoff from "./Faceoff.jsx";
import NominationsFaceoff from "./NominationsFaceoff.jsx";
import "./index.css";

// GitHub Pages has no server-side routing: vite.config.js copies the built
// index.html to 404.html so any path (e.g. /games/daily) still loads this
// bundle, and we pick the page to render from the real pathname here.
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const ROUTES = {
  "/games/daily": DailyGame,
  "/games/daily-oscar-edition": OscarWinnerGame,
  "/games/faceoff": Faceoff,
  "/games/faceoff-oscars-edition": NominationsFaceoff,
};
const Root = ROUTES[path] || App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
