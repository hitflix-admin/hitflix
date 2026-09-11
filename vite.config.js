import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Every client-side route in main.jsx's ROUTES map, with its own title and
// description — keep this in sync with that map when adding a game.
const ROUTE_META = [
  {
    path: "/daily",
    title: "Daily Movie — Guess the Featured Movie | Hitflix",
    description:
      "Guess the featured Oscar-nominated movie in 5 tries. Its genre is revealed upfront as a clue, and each guess is scored on year, director, country, cast, runtime, and Oscar nominations. A new movie every day.",
  },
  {
    path: "/oscar-winner",
    title: "Daily Movie (Oscar Edition) — Guess the Oscar Winner | Hitflix",
    description:
      "Guess the Oscar-winning movie in 5 tries. Its genre and the category it won are revealed upfront as clues. A new movie every day.",
  },
  {
    path: "/faceoff",
    title: "Faceoff — Box Office Head-to-Head Game | Hitflix",
    description:
      "Pick which of two similar movies made more at the worldwide box office across 5 head-to-head rounds. New matchups every day.",
  },
  {
    path: "/nominations-faceoff",
    title: "Faceoff (Oscars Edition) — Oscar Nominations Head-to-Head | Hitflix",
    description:
      "Pick which of two similar movies earned more Oscar nominations across 5 head-to-head rounds. New matchups every day.",
  },
];

// GitHub Pages has no server-side routing. The old fix (copy index.html to
// 404.html) makes an unknown path still load the app, but GitHub Pages
// returns that response with an HTTP 404 status — search engines treat a 404
// status as "this page doesn't exist" regardless of what's rendered
// client-side, and every page also shared the homepage's own canonical/og:url,
// which told them to fold /daily etc. into the homepage instead of indexing
// them separately. Generating a real <route>/index.html for each known route
// (which GitHub Pages serves as a normal 200) with its own title, meta
// description, canonical link, and og:url fixes both problems — the client
// bundle is identical either way, main.jsx picks the page from the real URL.
function spaRoutes() {
  return {
    name: "spa-routes",
    closeBundle() {
      const outDir = "dist";
      const template = fs.readFileSync(path.join(outDir, "index.html"), "utf8");

      // Unknown paths (typos, old links) still fall back to the SPA shell.
      fs.writeFileSync(path.join(outDir, "404.html"), template);

      const homeTitle = template.match(/<title>([^<]*)<\/title>/)[1];
      const homeDescription = template.match(/name="description"\s+content="([^"]*)"/)[1];

      for (const route of ROUTE_META) {
        let html = template.split(homeTitle).join(route.title);
        html = html.split(homeDescription).join(route.description);
        html = html.replace('href="https://hitflix.club/"', `href="https://hitflix.club${route.path}"`);
        html = html.replace('content="https://hitflix.club/"', `content="https://hitflix.club${route.path}"`);
        html = html.replace('"url": "https://hitflix.club/"', `"url": "https://hitflix.club${route.path}"`);

        const dir = path.join(outDir, route.path);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), spaRoutes()],
  base: "/",
});
