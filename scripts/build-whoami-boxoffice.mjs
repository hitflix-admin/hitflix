// Builds src/whoAmIBoxOffice.json: the top 20 domestic (US/Canada) grossing
// releases of each of the last 50 complete years, from Box Office Mojo's
// yearly charts. One half of the "Who am I?" movie pool — the other half is
// the hand-curated pop-culture list in src/whoAmIPopCulture.json, for iconic,
// endlessly quoted movies that never topped the box office (The Room, Office
// Space, The Big Lebowski…). See getWhoAmIPool in src/whoAmI.js.
//
// Box Office Mojo's year pages list every release that played that year,
// re-releases included (E.T.'s 1985 run, Star Wars' 1997 Special Edition), so
// a title already seen in an earlier year is dropped rather than counted twice.
//
// Usage: node scripts/build-whoami-boxoffice.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const YEARS_BACK = 50;
const PER_YEAR = 20;
const LAST_YEAR = new Date().getFullYear() - 1; // the current year isn't finished

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function topReleases(year) {
  const res = await fetch(`https://www.boxofficemojo.com/year/${year}/?grossesOption=totalGrosses`, {
    headers: { "User-Agent": "Mozilla/5.0 (hitflix.club data build)" },
  });
  // Box Office Mojo's yearly charts start at 1977 — 1976 comes from the
  // pop-culture list alone
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${year}: HTTP ${res.status}`);
  const html = await res.text();
  const titles = [...html.matchAll(/mojo-field-type-release[^"]*"><a[^>]*href="\/release\/[^"]*">([^<]+)<\/a>/g)].map((m) =>
    decodeEntities(m[1]).trim()
  );
  if (titles.length < PER_YEAR) throw new Error(`${year}: only found ${titles.length} releases`);
  return titles;
}

const key = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function main() {
  const out = {};
  const seen = new Set();
  for (let year = LAST_YEAR - YEARS_BACK + 1; year <= LAST_YEAR; year++) {
    const titles = await topReleases(year);
    if (!titles) {
      console.log(`${year}: no chart, skipped`);
      continue;
    }
    const picked = [];
    for (const title of titles) {
      if (seen.has(key(title))) continue;
      seen.add(key(title));
      picked.push(title);
      if (picked.length === PER_YEAR) break;
    }
    out[year] = picked;
    console.log(`${year}: ${picked.slice(0, 3).join(", ")}…`);
    await new Promise((r) => setTimeout(r, 400)); // be polite
  }
  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/whoAmIBoxOffice.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${outPath}`);
}

main();
