import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// GitHub Pages serves a static 404 for any unknown path (e.g. /daily). Copying
// the built index.html to 404.html makes it serve the app shell instead, so
// client-side routing in main.jsx can pick the right page from the URL.
function spaFallback404() {
  return {
    name: "spa-fallback-404",
    closeBundle() {
      const outDir = "dist";
      fs.copyFileSync(path.join(outDir, "index.html"), path.join(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallback404()],
  base: "/",
});
