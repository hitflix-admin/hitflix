// Builds public/upcoming.json — the homepage's "Coming to Theaters" section —
// from Wikipedia's "List of American films of {year}" pages (this year and
// next). Those pages keep a release calendar split into quarterly tables
// (January–March, …), where each row is one film: opening date, title,
// production company, cast and crew.
//
// Those calendars list hundreds of films a year, most of them small, so
// "major" is decided in two passes:
//   1. Only films with their own Wikipedia article (a linked title) and a
//      release date between today and HORIZON_DAYS out.
//   2. Ranked by Wikipedia pageviews over the last 30 days — the best free
//      "how much are people looking this up" signal — with a boost for the
//      big theatrical distributors in MAJOR_STUDIOS, then the top MAX_FILMS
//      are kept and re-sorted by release date.
//
// Runs in both deploy workflows right before `npm run build` (non-blocking:
// if Wikipedia hiccups, the committed copy of public/upcoming.json ships
// instead). Unlike the daily puzzle file this isn't secret, so a snapshot is
// committed too — local dev and any deploy always have something to show.
// The client also hides any film whose date has already passed, so a stale
// file degrades gracefully instead of listing last month's releases.
//
// Usage: node scripts/build-upcoming-releases.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const UA = "HitflixDataBuild/1.0 (contact: konnorroelofs@gmail.com)";
const HORIZON_DAYS = 365; // a year of releases (the homepage shows two weekends; "See more" the rest)
const MAX_FILMS = 60;
const STUDIO_BOOST = 3; // pageview multiplier for a major distributor
const MIN_PAGEVIEWS = 1500; // over 30 days — below this nothing counts as "major"

// Matched against the "Production company" cell. Covers the distributors
// that put films in wide release, plus their main labels.
const MAJOR_STUDIOS = [
  "Walt Disney", "Disney", "Pixar", "Marvel Studios", "Lucasfilm", "20th Century",
  "Searchlight", "Warner Bros", "New Line", "DC Studios", "Universal", "Focus Features",
  "Illumination", "DreamWorks", "Paramount", "Sony Pictures", "Columbia Pictures",
  "TriStar", "Screen Gems", "Lionsgate", "Metro-Goldwyn-Mayer", "Amazon MGM", "A24",
  "Neon", "Legendary", "Blumhouse", "Apple Original Films", "Angel Studios",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function fetchWikitext(page) {
  const data = await getJson(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`
  );
  return data?.parse?.wikitext || "";
}

// Wikitext → readable text: drop refs/templates, keep link labels.
function plainText(s) {
  return s
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripRefs(s) {
  return s.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
}

// Splits a table row into its cells. Rows mix one-cell-per-line ("| a\n| b")
// with inline cells ("| a || b"), and attribute prefixes ("rowspan=2 | x").
function rowCells(row) {
  const cells = [];
  for (const line of row.split("\n")) {
    const m = line.match(/^\s*([|!])(.*)$/);
    if (!m || m[2].startsWith("}") || m[2].startsWith("-")) continue;
    for (const part of m[2].split(/\|\||!!/)) {
      // "attrs | content" — but not a "|" inside [[link|label]] or {{tmpl|x}}
      const attr = part.match(/^([^[{|]*?=[^[{|]*?)\|(?!\|)([\s\S]*)$/);
      cells.push({ header: m[1] === "!", attrs: attr ? attr[1] : "", text: (attr ? attr[2] : part).trim() });
    }
  }
  return cells;
}

// One quarterly table → [{ date, linkTarget, title, studio, crew }]
function parseQuarterTable(table, year) {
  const films = [];
  let month = null;
  let day = null;
  for (const raw of table.split(/\n\|-[^\n]*/).slice(1)) {
    const row = stripRefs(raw);
    let cells = rowCells(row);

    // Leading month cell (spans the whole month). Read from its visible
    // letters ("D<br>E<br>C…") — the aria-label and data-sort-value are
    // hand-typed and have had typos ("Decmber", June sorted as "03").
    const monthCell = cells.find((c) => c.header && /<span/.test(c.text));
    if (monthCell) {
      const letters = monthCell.text.replace(/<[^>]+>/g, "").replace(/\s/g, "").toUpperCase();
      const idx = MONTHS.findIndex((m) => m.toUpperCase() === letters);
      if (idx >= 0) month = idx;
      cells = cells.filter((c) => c !== monthCell);
    }
    // Leading day cell: '''2'''
    const dayMatch = cells[0]?.text.match(/^'''\s*(\d{1,2})\s*'''$/);
    if (dayMatch) {
      day = parseInt(dayMatch[1], 10);
      cells = cells.slice(1);
    }
    if (month == null || day == null || cells.length < 2) continue;

    const titleCell = cells[0].text;
    const link = titleCell.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
    if (!link) continue; // no article of its own → not a major release
    films.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      linkTarget: link[1].trim(),
      title: plainText(link[2] || link[1]),
      studio: plainText(cells[1].text),
      crew: cells[2] ? plainText(cells[2].text) : "",
    });
  }
  return films;
}

function parseYear(wikitext, year) {
  const films = [];
  const quarterRe = /==\s*(?:January|April|July|October)[^=\n]*==\s*\n(\{\|[\s\S]*?\n\|\})/g;
  for (const m of wikitext.matchAll(quarterRe)) films.push(...parseQuarterTable(m[1], year));
  return films;
}

// Resolves redirects and pulls poster, short description and a two-sentence
// extract for each title, in batches (extracts are capped at 20 per request).
async function fetchPageInfo(titles) {
  const info = new Map(); // link target → page info
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "pageimages|description|extracts|info",
      piprop: "thumbnail",
      pithumbsize: "320",
      pilicense: "any",
      exintro: "1",
      explaintext: "1",
      exsentences: "2",
      inprop: "url",
      titles: batch.join("|"),
    });
    const data = await getJson(`https://en.wikipedia.org/w/api.php?${params}`);
    const q = data?.query || {};
    const alias = new Map();
    for (const n of q.normalized || []) alias.set(n.to, n.from);
    for (const r of q.redirects || []) alias.set(r.to, alias.get(r.from) || r.from);
    for (const p of q.pages || []) {
      if (p.missing) continue;
      const original = alias.get(p.title) || p.title;
      info.set(original, p);
      info.set(p.title, p);
    }
    await sleep(200);
  }
  return info;
}

async function fetchPageviews(title, start, end) {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}/daily/${start}/${end}`;
  try {
    const data = await getJson(url);
    return (data?.items || []).reduce((n, it) => n + it.views, 0);
  } catch (e) {
    return 0;
  }
}

const ymd = (d) => d.toISOString().slice(0, 10);
const compact = (d) => ymd(d).replace(/-/g, "");

async function main() {
  const now = new Date();
  const today = ymd(now);
  const horizon = ymd(new Date(now.getTime() + HORIZON_DAYS * 864e5));
  const year = now.getUTCFullYear();

  let films = [];
  for (const y of [year, year + 1]) {
    const parsed = parseYear(await fetchWikitext(`List of American films of ${y}`), y);
    console.log(`${y}: parsed ${parsed.length} linked releases`);
    films.push(...parsed);
    await sleep(250);
  }
  films = films.filter((f) => f.date >= today && f.date <= horizon);
  console.log(`${films.length} releases between ${today} and ${horizon}`);

  const info = await fetchPageInfo([...new Set(films.map((f) => f.linkTarget))]);

  // A film can appear twice (limited then wide release) — keep the first date.
  const seen = new Set();
  const candidates = [];
  for (const f of films) {
    const page = info.get(f.linkTarget);
    if (!page || seen.has(page.pageid)) continue;
    // Untitled films often link to the studio's page ("DreamWorks Animation",
    // "New Line Cinema") and remakes to the original ("1999 film by …") —
    // only keep links whose own description is a film of about this year.
    const desc = page.description || "";
    if (!/\bfilm\b/i.test(desc)) continue;
    if (/\b(company|studio|studios|subsidiary|franchise|division|label)\b/i.test(desc.replace(/\b[A-Z][\w.]* Studios film\b/, ""))) continue;
    const descYear = desc.match(/\b(19|20)\d{2}\b/);
    if (descYear && Number(descYear[0]) < Number(f.date.slice(0, 4)) - 1) continue;
    seen.add(page.pageid);
    candidates.push({ ...f, page });
  }

  const end = new Date(now.getTime() - 864e5);
  const start = new Date(end.getTime() - 29 * 864e5);
  for (const c of candidates) {
    c.views = await fetchPageviews(c.page.title, compact(start), compact(end));
    c.major = MAJOR_STUDIOS.some((s) => c.studio.toLowerCase().includes(s.toLowerCase()));
    c.score = c.views * (c.major ? STUDIO_BOOST : 1);
    await sleep(60);
  }

  const picked = candidates
    .filter((c) => c.views >= MIN_PAGEVIEWS)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FILMS)
    .sort((a, b) => a.date.localeCompare(b.date) || b.score - a.score);

  // A near-empty result means the page format changed, not that Hollywood
  // stopped releasing films — keep the previous file rather than blank it.
  if (picked.length < 5) {
    throw new Error(`Only ${picked.length} films picked — not overwriting public/upcoming.json`);
  }

  const director = (crew) => {
    const m = crew.match(/^(.*?)\s*\(director/);
    return m ? m[1].replace(/;.*$/, "").trim() : "";
  };

  const out = {
    generatedAt: now.toISOString(),
    films: picked.map((c) => ({
      id: String(c.page.pageid),
      title: c.title,
      pageTitle: c.page.title,
      releaseDate: c.date,
      studio: c.studio,
      director: director(c.crew),
      poster: c.page.thumbnail?.source || null,
      description: c.page.description || "",
      extract: c.page.extract || "",
      pageUrl: c.page.fullurl || "",
    })),
  };

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/upcoming.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${out.films.length} films to ${outPath}`);
  for (const c of picked) console.log(`  ${c.date}  ${c.title}  (${c.views} views${c.major ? ", major studio" : ""})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
