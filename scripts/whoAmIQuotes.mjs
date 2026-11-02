// "Who am I?" — quote hints. Looks up a movie's five lines of dialogue,
// ordered from hardest to place to the single most iconic line in the film.
// Knows nothing about how the movie was chosen (see src/whoAmISelection.js);
// scripts/build-daily-puzzle.mjs connects the two.
//
// The lines live in scripts/whoAmIQuotes.json, written once ahead of time
// (by Claude, in a Claude Code session) rather than generated each day, so
// the daily build needs no API key and costs nothing. Keyed by the pool
// entry's key ("normalized title|year", see getWhoAmIPool); each entry is
// { title, quotes: [[line, speaker] ×5] }. Movies without an entry are never
// picked. Build-time only: never import this from browser code (the file is
// ~600 KB), and run `node scripts/check-whoami-quotes.mjs` after editing it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const QUOTE_COUNT = 5;
export const MAX_WORDS = 15;

const QUOTES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "whoAmIQuotes.json");

let cached = null;
function allQuotes() {
  cached ??= JSON.parse(readFileSync(QUOTES_PATH, "utf8"));
  return cached;
}

export function hasWhoAmIQuotes(key) {
  return key in allQuotes();
}

// [{ line, speaker }] ×5 for a pool key, or null
export function whoAmIQuotesFor(key) {
  const entry = allQuotes()[key];
  return entry ? entry.quotes.map(([line, speaker]) => ({ line, speaker })) : null;
}

const normalize = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// The title before any subtitle, minus a leading article ("The Lord of the
// Rings: The Two Towers" → "lord of the rings"). Very short titles ("Up",
// "It", "Us") are everyday words, so they're not checked.
function titleCore(title) {
  return normalize(title.split(":")[0]).replace(/^(the|a|an) /, "");
}

// Why a quote set breaks the game's rules, or null if it's fine.
export function problemWith(quotes, title) {
  if (!Array.isArray(quotes) || quotes.length !== QUOTE_COUNT) return `expected ${QUOTE_COUNT} quotes`;
  const core = titleCore(title);
  for (const [i, q] of quotes.entries()) {
    if (!Array.isArray(q) || typeof q[0] !== "string" || typeof q[1] !== "string") return `quote ${i + 1} isn't [line, speaker]`;
    const line = q[0].trim();
    if (!line) return `quote ${i + 1} is empty`;
    if (line.split(/\s+/).length > MAX_WORDS) return `quote ${i + 1} is over ${MAX_WORDS} words`;
    if (core.length >= 4 && ` ${normalize(line)} `.includes(` ${core} `)) return `quote ${i + 1} contains the title`;
  }
  if (new Set(quotes.map((q) => normalize(q[0]))).size !== QUOTE_COUNT) return "duplicate quotes";
  return null;
}
