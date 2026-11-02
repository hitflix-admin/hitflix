// Checks scripts/whoAmIQuotes.json against the game's rules (five lines, at
// most 15 words each, no movie title in any line, no repeats) and that every
// entry still matches a movie in the pool. Run after editing the quotes or
// either pool list.
//
// Usage: node scripts/check-whoami-quotes.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getWhoAmIPool } from "../src/whoAmISelection.js";
import { problemWith } from "./whoAmIQuotes.mjs";

const quotes = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "whoAmIQuotes.json"), "utf8"));
const pool = getWhoAmIPool();
const poolKeys = new Set(pool.map((c) => c.key));

const problems = [];
for (const [key, entry] of Object.entries(quotes)) {
  if (!poolKeys.has(key)) problems.push(`${key}: not in the pool (renamed or removed from a list?)`);
  const problem = problemWith(entry.quotes, entry.title);
  if (problem) problems.push(`${key}: ${problem}`);
}

const quoted = pool.filter((c) => c.key in quotes);
const count = (pred) => quoted.filter(pred).length;
console.log(`${quoted.length} of ${pool.length} pool movies have quotes`);
console.log(`  box office only: ${count((c) => c.sources.length === 1 && c.sources[0] === "boxOffice")}`);
console.log(`  both lists:      ${count((c) => c.sources.length > 1)}`);
console.log(`  pop culture only: ${count((c) => c.sources.length === 1 && c.sources[0] === "popCulture")}`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log("\nAll quotes pass.");
