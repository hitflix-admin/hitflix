// Builds src/boxOfficeTop10.json — the candidate pool for the regular Daily Movie
// game: the top 10 highest-grossing films of each of the last 45 years, scraped
// from the "Highest-grossing films" table on each year's Wikipedia "{year} in
// film" page (the same table Wikipedia itself keeps up to date year to year).
// Re-run this script periodically (e.g. once a year) to roll the window forward
// and pick up the newly-completed year.
//
// Usage: node scripts/build-boxoffice-data.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const UA = "HitflixDataBuild/1.0 (contact: konnorroelofs@gmail.com)";
const YEARS_BACK = 45;
const RANKS_PER_YEAR = 10; // Wikipedia's yearly tables consistently list a top 10, not more.

async function fetchWikitext(page) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
    page
  )}&prop=wikitext&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const data = await res.json();
  return data?.parse?.wikitext?.["*"] || "";
}

// Pulls the ranked title list out of a year's "Highest-grossing films" wikitable.
// Two rank-cell styles show up across the decades of edits to these pages:
//   "! style=\"text-align:center;\"| 1"   (header-style cell, older convention)
//   "| 1"                                  (plain cell, newer convention)
// and titles are always the first [[wikilink]] in the row (the rank cell itself
// never contains one), so that part of the parse is style-independent.
function extractTop10(wikitext) {
  const sectionMatch = wikitext.match(/==\s*Highest-grossing films[^=]*==([\s\S]*?)(?:\n==[^=]|$)/i);
  if (!sectionMatch) return null;

  const tableMatch = sectionMatch[1].match(/\{\|[\s\S]*?\n\|\}/);
  if (!tableMatch) return null;

  const rows = tableMatch[0].split(/\n\|-/).slice(1);
  const results = [];
  for (const row of rows) {
    const rankMatch =
      row.match(/^!(?:[^\n|]*\|)?\s*(\d{1,2})\s*$/m) || row.match(/^\|\s*(\d{1,2})\s*$/m);
    const linkMatch = row.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (!rankMatch || !linkMatch) continue;
    const rank = parseInt(rankMatch[1], 10);
    if (rank < 1 || rank > RANKS_PER_YEAR) continue;
    results.push({ rank, title: (linkMatch[2] || linkMatch[1]).trim() });
  }

  const byRank = new Map();
  for (const r of results) if (!byRank.has(r.rank)) byRank.set(r.rank, r.title);
  return [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, title]) => title);
}

async function main() {
  const currentYear = new Date().getUTCFullYear();
  const lastCompleteYear = currentYear - 1;
  const firstYear = lastCompleteYear - YEARS_BACK + 1;

  const out = {};
  const problems = [];
  for (let year = firstYear; year <= lastCompleteYear; year++) {
    const wikitext = await fetchWikitext(`${year} in film`);
    const titles = extractTop10(wikitext);
    if (!titles || titles.length === 0) {
      problems.push(`${year}: no table found`);
      continue;
    }
    if (titles.length < RANKS_PER_YEAR) {
      problems.push(`${year}: only ${titles.length}/${RANKS_PER_YEAR} rows parsed`);
    }
    out[year] = titles;
    process.stdout.write(`${year}: ${titles.length} titles\n`);
    await new Promise((r) => setTimeout(r, 250)); // be polite to Wikipedia's API
  }

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/boxOfficeTop10.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

  const totalTitles = Object.values(out).reduce((n, arr) => n + arr.length, 0);
  console.log(`\nWrote ${Object.keys(out).length} years, ${totalTitles} candidate titles to ${outPath}`);
  if (problems.length) {
    console.log(`\n${problems.length} year(s) need a look:`);
    problems.forEach((p) => console.log(`  - ${p}`));
  }
}

main();
