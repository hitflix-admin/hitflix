import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Every client-side route in main.jsx's ROUTES map, with its own title and
// description — keep this in sync with that map when adding a game.
const ROUTE_META = [
  {
    path: "/games/daily",
    title: "Daily Movie — Guess the Featured Movie | Hitflix",
    description:
      "Guess the featured Oscar-nominated movie in 5 tries. Its genre is revealed upfront as a clue, and each guess is scored on year, director, country, cast, runtime, and Oscar nominations. A new movie every day.",
  },
  {
    path: "/games/daily-oscar-edition",
    title: "Daily Movie (Oscar Edition) — Guess the Oscar Winner | Hitflix",
    description:
      "Guess the Oscar-winning movie in 5 tries. Its genre and the category it won are revealed upfront as clues. A new movie every day.",
  },
  {
    path: "/games/faceoff",
    title: "Faceoff — Box Office Head-to-Head Game | Hitflix",
    description:
      "Pick which of two similar movies made more at the worldwide box office across 5 head-to-head rounds. New matchups every day.",
  },
  {
    path: "/games/faceoff-oscar-edition",
    title: "Faceoff (Oscar Edition) — Oscar Nominations Head-to-Head | Hitflix",
    description:
      "Pick which of two similar movies earned more Oscar nominations across 5 head-to-head rounds. New matchups every day.",
  },
];

// The games used to live at these flat paths, before moving under /games/ —
// redirect each to its new home so anything already shared or indexed under
// the old URL still lands correctly.
const OLD_PATH_REDIRECTS = {
  "/daily": "/games/daily",
  "/oscar-winner": "/games/daily-oscar-edition",
  "/faceoff": "/games/faceoff",
  "/nominations-faceoff": "/games/faceoff-oscar-edition",
  // Briefly deployed under the plural slug before this was made consistent
  // with the singular "Oscar Edition" used everywhere else in the app.
  "/games/faceoff-oscars-edition": "/games/faceoff-oscar-edition",
};

function redirectHtml(toPath) {
  const url = `https://hitflix.club${toPath}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=${url}" />
    <link rel="canonical" href="${url}" />
    <title>Redirecting… | Hitflix</title>
  </head>
  <body>
    <p>This page has moved. <a href="${url}">Continue to ${url}</a>.</p>
  </body>
</html>
`;
}

// GitHub Pages has no server-side routing. The old fix (copy index.html to
// 404.html) makes an unknown path still load the app, but GitHub Pages
// returns that response with an HTTP 404 status — search engines treat a 404
// status as "this page doesn't exist" regardless of what's rendered
// client-side, and every page also shared the homepage's own canonical/og:url,
// which told them to fold /games/daily etc. into the homepage instead of
// indexing them separately. Generating a real <route>/index.html for each
// known route (which GitHub Pages serves as a normal 200) with its own title,
// meta description, canonical link, and og:url fixes both problems — the
// client bundle is identical either way, main.jsx picks the page from the
// real URL.
// The built stylesheet is tiny (under 1 KB) but as a separate <link
// rel="stylesheet"> it still blocks first render on its own network
// round-trip. Inlining it into a <style> tag removes that request entirely.
function inlineStylesheet(html, outDir) {
  return html.replace(
    /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/,
    (match, href) => {
      const cssPath = path.join(outDir, href.replace(/^\//, ""));
      const css = fs.readFileSync(cssPath, "utf8");
      return `<style>${css}</style>`;
    },
  );
}

function spaRoutes() {
  return {
    name: "spa-routes",
    closeBundle() {
      const outDir = "dist";
      const template = inlineStylesheet(
        fs.readFileSync(path.join(outDir, "index.html"), "utf8"),
        outDir,
      );
      fs.writeFileSync(path.join(outDir, "index.html"), template);

      // Unknown paths (typos, old links not covered by the redirects below)
      // still fall back to the SPA shell.
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

      for (const [oldPath, newPath] of Object.entries(OLD_PATH_REDIRECTS)) {
        const dir = path.join(outDir, oldPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), redirectHtml(newPath));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), spaRoutes()],
  base: "/",
  build: {
    sourcemap: true,
  },
});
