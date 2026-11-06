// Builds the two box-office-hit candidate pools (see getBoxOfficePool in
// dailyMovie.js), each year's top 10 scraped from a Wikipedia table that
// Wikipedia itself keeps up to date year to year:
//   - src/boxOfficeTop10.json — WORLDWIDE gross, from the "Highest-grossing
//     films" table on each "{year} in film" page. Used by the regular Faceoff
//     game (60 years).
//   - src/boxOfficeDomesticTop10.json — US DOMESTIC gross, from the "Box office"
//     table on each "List of American films of {year}" page. Used by the regular
//     Daily Movie game (45 years), so its picks are movies an American audience
//     actually saw in theaters — the worldwide list had started surfacing
//     Chinese-market hits (Ne Zha 2, The Battle at Lake Changjin, Hi, Mom) that
//     barely played in the US.
// Re-run this script periodically (e.g. once a year) to roll the window forward
// and pick up the newly-completed year.
//
// Usage: node scripts/build-boxoffice-data.mjs [worldwide] [domestic]

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const UA = "HitflixDataBuild/1.0 (contact: konnorroelofs@gmail.com)";
const DATASETS = [
  {
    label: "worldwide",
    file: "boxOfficeTop10.json",
    yearsBack: 60, // Faceoff's window
    page: (year) => `${year} in film`,
    // 1960s pages use "Top-grossing films"; later years switched to "Highest-grossing films".
    sectionRe: /==\s*(?:Top|Highest)-grossing films[^=]*==([\s\S]*?)(?:\n==[^=]|$)/i,
  },
  {
    label: "domestic",
    file: "boxOfficeDomesticTop10.json",
    yearsBack: 45, // Daily Movie's window
    page: (year) => `List of American films of ${year}`,
    sectionRe: /==\s*Box office\s*==([\s\S]*?)(?:\n==[^=]|$)/i,
  },
];
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
function extractTop10(wikitext, sectionRe) {
  const sectionMatch = wikitext.match(sectionRe);
  if (!sectionMatch) return null;

  // First *wikitable* in the section — some pages (e.g. 2021's American films
  // list) open the section with an empty layout table before the real one.
  const tableMatch = sectionMatch[1].match(/\{\|[^\n]*wikitable[\s\S]*?\n\|\}/);
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

async function buildDataset({ label, file, yearsBack, page, sectionRe }) {
  const currentYear = new Date().getUTCFullYear();
  const lastCompleteYear = currentYear - 1;
  const firstYear = lastCompleteYear - yearsBack + 1;

  console.log(`\n--- ${label} (${firstYear}-${lastCompleteYear}) ---`);
  const out = {};
  const problems = [];
  for (let year = firstYear; year <= lastCompleteYear; year++) {
    const wikitext = await fetchWikitext(page(year));
    const titles = extractTop10(wikitext, sectionRe);
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

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src", file);
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

  const totalTitles = Object.values(out).reduce((n, arr) => n + arr.length, 0);
  console.log(`\nWrote ${Object.keys(out).length} years, ${totalTitles} candidate titles to ${outPath}`);
  if (problems.length) {
    console.log(`\n${problems.length} year(s) need a look:`);
    problems.forEach((p) => console.log(`  - ${p}`));
  }
}

// Optional args pick which datasets to rebuild (e.g. "domestic"); default is all.
async function main() {
  const only = process.argv.slice(2);
  for (const dataset of DATASETS) {
    if (only.length && !only.includes(dataset.label)) continue;
    await buildDataset(dataset);
  }
}

main();
