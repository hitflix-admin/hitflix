import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import DailyGame from "./DailyGame.jsx";
import OscarWinnerGame from "./OscarWinnerGame.jsx";
import Faceoff from "./Faceoff.jsx";
import "./index.css";

// GitHub Pages has no server-side routing: vite.config.js copies the built
// index.html to 404.html so any path (e.g. /daily) still loads this bundle,
// and we pick the page to render from the real pathname here.
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const ROUTES = {
  "/daily": DailyGame,
  "/oscar-winner": OscarWinnerGame,
  "/faceoff": Faceoff,
};
const Root = ROUTES[path] || App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
