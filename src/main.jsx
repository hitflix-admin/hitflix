import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Each route is its own chunk, fetched only for the page that needs it —
// every route previously shipped in one bundle, so e.g. loading the homepage
// meant downloading and parsing all three games' code too. Routing between
// these is always a full page load (GitHub Pages has no server-side routing,
// and cross-links use plain <a> tags), so there's no client-side transition
// to keep smooth here — a lazy import at startup costs nothing a normal
// script fetch wouldn't already cost.
const App = lazy(() => import("./App.jsx"));
const DailyGame = lazy(() => import("./DailyGame.jsx"));
const OscarWinnerGame = lazy(() => import("./OscarWinnerGame.jsx"));
const Faceoff = lazy(() => import("./Faceoff.jsx"));
const NominationsFaceoff = lazy(() => import("./NominationsFaceoff.jsx"));

// GitHub Pages has no server-side routing: vite.config.js copies the built
// index.html to 404.html so any path (e.g. /games/daily) still loads this
// bundle, and we pick the page to render from the real pathname here.
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const ROUTES = {
  "/games/daily": DailyGame,
  "/games/daily-oscar-edition": OscarWinnerGame,
  "/games/faceoff": Faceoff,
  "/games/faceoff-oscar-edition": NominationsFaceoff,
};
const Root = ROUTES[path] || App;

// fallback={null}: the shared dark background (index.css) already matches
// every route's own background, so there's nothing worth painting for the
// brief moment before the route chunk finishes loading.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>
);
