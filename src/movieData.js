// Shared Wikipedia + Oscar-database plumbing used by both the ledger app (App.jsx)
// and the daily movie game (DailyGame.jsx): search, infobox parsing, and award lookups.

import oscarAwardsData from "./oscarAwards.json";

export function yearFromDescription(desc) {
  if (!desc) return "";
  const m = desc.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? m[0] : "";
}

// Wikipedia disambiguates film articles with a trailing "(film)" / "(2020 film)" /
// "(American film)" etc. — strip that for display; the raw title is kept separately
// (as pageTitle) so lookups still hit the correct Wikipedia page.
export function cleanMovieTitle(title) {
  if (!title) return title;
  return title.replace(/\s*\([^()]*\bfilm\b[^()]*\)\s*$/i, "").trim();
}

const NON_MOVIE_DESCRIPTION = /\b(director|actor|actress|producer|screenwriter|composer|cinematographer|editor|soundtrack|album|score|song|series|franchise|trilogy|registry|studio|festival|award|musician|singer|novel|book|video game|podcast)\b/i;

function isMovieDescription(desc) {
  if (!desc) return false;
  if (!/\bfilm\b/i.test(desc)) return false;
  return !NON_MOVIE_DESCRIPTION.test(desc);
}

export async function searchWikipediaFilms(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&list=search&srlimit=8&format=json&srsearch=${encodeURIComponent(
    query + " film"
  )}`;
  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error("search failed");
  const data = await res.json();
  const titles = (data?.query?.search || []).map((r) => r.title);
  if (titles.length === 0) return [];

  const summaries = await Promise.all(
    titles.map(async (t) => {
      try {
        const r = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`
        );
        if (!r.ok) return null;
        const s = await r.json();
        if (s.type === "disambiguation") return null;
        return s;
      } catch (e) {
        return null;
      }
    })
  );

  return summaries
    .filter(Boolean)
    .map((s) => ({
      id: String(s.pageid),
      title: cleanMovieTitle(s.title),
      pageTitle: s.title,
      year: yearFromDescription(s.description || s.extract),
      description: s.description || "",
      extract: s.extract || "",
      poster: s.thumbnail ? s.thumbnail.source : null,
      pageUrl: s.content_urls?.desktop?.page || "",
    }))
    .filter((s) => s.title && isMovieDescription(s.description));
}

/* ---------------- Wikipedia infobox parsing ---------------- */

const HTML_ENTITIES = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  minus: "−",
};

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const lower = name.toLowerCase();
      return lower in HTML_ENTITIES ? HTML_ENTITIES[lower] : m;
    });
}

// Footnote/explanatory-note templates (e.g. {{efn|...}} explaining a cumulative
// box-office figure) carry annotation text that isn't meant to be displayed inline —
// strip them out entirely rather than keeping their contents.
function stripFootnoteTemplates(wikitext) {
  let s = wikitext;
  const nameRegex = /\{\{\s*(?:efn|refn|sfn|r|citation needed|cn)\b/i;
  let guard = 0;
  while (nameRegex.test(s) && guard < 25) {
    const block = extractTemplate(s, nameRegex);
    if (!block) break;
    s = s.replace(block, "");
    guard++;
  }
  return s;
}

function cleanWikitext(raw) {
  if (!raw) return "";
  let s = raw;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<ref[^>]*\/>/gi, "");
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  s = stripFootnoteTemplates(s);
  s = s.replace(/\{\{nbsp\}\}/gi, " ");
  s = s.replace(
    /\{\{(?:Plainlist|plainlist|ubl|hlist|flatlist)\s*\|([\s\S]*?)\}\}/gi,
    (_, inner) =>
      splitTopLevel(inner, "|")
        .flatMap((x) => x.split(/\n?\*/))
        .map((x) => x.replace(/^[a-z]+\s*=\s*/i, "").trim())
        .filter(Boolean)
        .join(", ")
  );
  s = s.replace(/\{\{(?:small|nowrap|sic|nobr)\|([^{}]*)\}\}/gi, "$1");
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  s = s.replace(/'''''([^']+)'''''/g, "$1");
  s = s.replace(/'''([^']+)'''/g, "$1");
  s = s.replace(/''([^']+)''/g, "$1");
  s = s.replace(/\{\{[^{}]*\}\}/g, "");
  s = s.replace(/\{\{|\}\}/g, "");
  s = s.replace(/<br\s*\/?>/gi, "; ");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeHtmlEntities(s);
  s = s.replace(/(\d)(million|billion|thousand)\b/gi, "$1 $2");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[;,\s]+|[;,\s]+$/g, "");
  return s;
}

function splitTopLevel(str, sep) {
  const parts = [];
  let depthCurly = 0;
  let depthBracket = 0;
  let buf = "";
  for (let i = 0; i < str.length; i++) {
    const two = str.slice(i, i + 2);
    if (two === "{{") {
      depthCurly++;
      buf += two;
      i++;
      continue;
    }
    if (two === "}}") {
      depthCurly--;
      buf += two;
      i++;
      continue;
    }
    if (two === "[[") {
      depthBracket++;
      buf += two;
      i++;
      continue;
    }
    if (two === "]]") {
      depthBracket--;
      buf += two;
      i++;
      continue;
    }
    const ch = str[i];
    if (ch === sep && depthCurly === 0 && depthBracket === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  parts.push(buf);
  return parts;
}

function extractTemplate(wikitext, nameRegex) {
  const m = wikitext.match(nameRegex);
  if (!m) return null;
  const i = m.index;
  let depth = 0;
  let j = i;
  for (; j < wikitext.length; j++) {
    if (wikitext.startsWith("{{", j)) {
      depth++;
      j++;
    } else if (wikitext.startsWith("}}", j)) {
      depth--;
      j++;
      if (depth === 0) {
        j++;
        break;
      }
    }
  }
  return wikitext.slice(i, j);
}

function parseInfobox(wikitext) {
  const block = extractTemplate(wikitext, /\{\{\s*Infobox\s+film/i);
  if (!block) return {};
  const inner = block.slice(2, -2);
  const parts = splitTopLevel(inner, "|");
  const fields = {};
  for (let p = 1; p < parts.length; p++) {
    const eq = parts[p].indexOf("=");
    if (eq === -1) continue;
    const key = parts[p].slice(0, eq).trim().toLowerCase();
    const value = parts[p].slice(eq + 1).trim();
    fields[key] = value;
  }
  return fields;
}

function parseUSReleaseDate(rawReleased) {
  if (!rawReleased) return null;
  const filmDateBlock = extractTemplate(rawReleased, /\{\{\s*Film date/i);
  if (!filmDateBlock) return cleanWikitext(rawReleased) || null;

  const inner = filmDateBlock.slice(2, -2);
  const positional = splitTopLevel(inner, "|")
    .slice(1)
    .map((p) => p.trim())
    .filter((p) => !/^[a-z]+\s*=/i.test(p));

  const entries = [];
  let i = 0;
  while (i < positional.length) {
    const year = positional[i];
    const month = positional[i + 1];
    const day = positional[i + 2];
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) break;
    i += 3;
    let location = "";
    if (i < positional.length && !/^\d{4}$/.test(positional[i])) {
      location = positional[i];
      i++;
    }
    entries.push({ year, month, day, location: cleanWikitext(location) });
  }
  if (entries.length === 0) return cleanWikitext(rawReleased) || null;

  const usEntry = entries.find((e) => /united states/i.test(e.location)) || entries[0];
  const date = new Date(Number(usEntry.year), Number(usEntry.month) - 1, Number(usEntry.day));
  if (isNaN(date.getTime())) return cleanWikitext(rawReleased) || null;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function parseRuntimeMinutes(rawRuntime) {
  const cleaned = cleanWikitext(rawRuntime);
  if (!cleaned) return null;
  const m = cleaned.match(/(\d+)\s*(?:minutes|min)?/i);
  return m ? parseInt(m[1], 10) : null;
}

// A field like "Action, Adventure" or "Tom Hanks; Meg Ryan" -> ["Action", "Adventure"].
function parseListField(rawValue, max = 8) {
  const cleaned = cleanWikitext(rawValue);
  if (!cleaned) return [];
  return cleaned
    .split(/[,;]|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
}

// Bundled from the Kaggle "The Oscar Award" dataset (CC0), which mirrors AMPAS's
// own awards database — complete per-category nomination/win history, unlike
// Wikidata which is often missing categories a film lost. Re-run
// scripts/build-oscar-data.mjs against a fresh CSV export to cover new ceremonies.
export const OSCAR_DATA_VERSION = "kaggle-1927-2026";

export function normalizeOscarTitle(title) {
  return (title || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function lookupOscarAwards(title, year) {
  const byYear = oscarAwardsData[normalizeOscarTitle(title)];
  if (!byYear) return { oscarNominations: 0, oscarWinners: [] };

  const years = Object.keys(byYear);
  const targetYear = parseInt(year, 10);
  const bestYear = Number.isFinite(targetYear)
    ? years.reduce((best, y) => (Math.abs(y - targetYear) < Math.abs(best - targetYear) ? y : best))
    : years[0];

  const entry = byYear[bestYear];
  return { oscarNominations: entry.nominations, oscarWinners: entry.winners };
}

export async function fetchMovieDetails(title, year, displayTitle) {
  try {
    const wikitextRes = await fetch(
      `https://en.wikipedia.org/w/api.php?origin=*&action=parse&page=${encodeURIComponent(
        title
      )}&prop=wikitext&section=0&format=json`
    );
    const wikitextData = await wikitextRes.json();
    const wikitext = wikitextData?.parse?.wikitext?.["*"] || "";
    const fields = parseInfobox(wikitext);

    const releaseDateUS = parseUSReleaseDate(fields.released || fields.release_date) || "TBD";
    const director = cleanWikitext(fields.director) || "TBD";
    const budget = cleanWikitext(fields.budget) || "TBD";
    const boxOffice = cleanWikitext(fields.gross) || "TBD";
    const countries = parseListField(fields.country || fields.countries, 5);
    const cast = parseListField(fields.starring, 6);
    const runtimeMinutes = parseRuntimeMinutes(fields.runtime);

    const awards = lookupOscarAwards(displayTitle || title, year);

    return {
      releaseDateUS,
      director,
      budget,
      boxOffice,
      countries,
      cast,
      runtimeMinutes,
      oscarNominations: awards.oscarNominations,
      oscarWinners: awards.oscarWinners,
      oscarSource: OSCAR_DATA_VERSION,
    };
  } catch (e) {
    return null;
  }
}

// Details fetched and cached before the wikitext cleanup (raw "&nbsp;", leftover
// "{{efn|...}}" footnotes, etc.) should be treated as stale so they're refetched once
// rather than staying wrong forever in the cache.
export function detailsLookStale(details) {
  if (!details) return true;
  if (details.oscarSource !== OSCAR_DATA_VERSION) return true;
  const fields = [details.budget, details.boxOffice, details.releaseDateUS, details.director];
  return fields.some((f) => typeof f === "string" && /&[a-zA-Z#0-9]+;|\{\{|efn\||refn\|/i.test(f));
}

/* ---------------- Genre tags (for Faceoff pairing) ---------------- */

// Wikipedia's film infobox dropped a "genre" field years ago (see fetchMovieDetails
// above), but genre-ish info still lives in the page's categories — e.g. a category
// named "American superhero films" or "2019 monster movies". Match known genre
// words against those category titles as a best-effort tag list.
const GENRE_KEYWORDS = [
  "action",
  "adventure",
  "animation",
  "biographical",
  "comedy",
  "crime",
  "disaster",
  "documentary",
  "drama",
  "fantasy",
  "heist",
  "horror",
  "martial arts",
  "monster",
  "musical",
  "mystery",
  "noir",
  "romance",
  "romantic comedy",
  "satire",
  "science fiction",
  "sci-fi",
  "slasher",
  "spy",
  "sports",
  "superhero",
  "supernatural",
  "thriller",
  "war",
  "western",
  "zombie",
];

function normalizeGenreTag(keyword) {
  if (keyword === "sci-fi") return "science fiction";
  if (keyword === "animation") return "animated";
  return keyword;
}

// Word-boundary matching, not plain substring — a category like "Academy Award
// winners" or "Warner Bros. films" otherwise false-matches "war" (a-WAR-d,
// WAR-ner) on nearly every notable film.
const GENRE_KEYWORD_PATTERNS = GENRE_KEYWORDS.map((keyword) => ({
  keyword,
  pattern: new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
}));

export async function fetchGenreTags(pageTitle) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?origin=*&action=query&prop=categories&clshow=!hidden&cllimit=500&format=json&titles=${encodeURIComponent(
        pageTitle
      )}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    const categories = (page?.categories || []).map((c) => c.title.replace(/^Category:/i, "").toLowerCase());
    // Wikipedia's genre categories are reliably phrased "<qualifiers> <genre> film(s)"
    // (e.g. "American war films") — restricting to those excludes unrelated categories
    // that happen to contain a genre word, like "Films set in Western Europe".
    const genreCategories = categories.filter((c) => /\bfilms?$/.test(c));

    const tags = new Set();
    for (const category of genreCategories) {
      for (const { keyword, pattern } of GENRE_KEYWORD_PATTERNS) {
        if (pattern.test(category)) tags.add(normalizeGenreTag(keyword));
      }
    }
    return [...tags];
  } catch (e) {
    return [];
  }
}

/* ---------------- Box office parsing (for Faceoff) ---------------- */

// Pulls a single USD figure out of a cleaned "gross" infobox string like
// "$407,999,255" or "$217.6 million (North America) $408 million (worldwide)".
// Prefers a figure explicitly marked "(worldwide)"; otherwise takes the largest
// dollar figure found, since a film's total gross is usually the biggest number
// present (domestic/international breakdowns are subsets of it).
export function parseBoxOfficeUSD(cleanedGross) {
  if (!cleanedGross) return null;
  const worldwideMatch = cleanedGross.match(/\$[\d,.]+\s*(?:million|billion|thousand)?[^()]*\(worldwide\)/i);
  const source = worldwideMatch ? worldwideMatch[0] : cleanedGross;

  const matches = [...source.matchAll(/\$([\d,]+(?:\.\d+)?)\s*(million|billion|thousand)?/gi)];
  if (matches.length === 0) return null;

  const values = matches.map(([, num, unit]) => {
    let n = parseFloat(num.replace(/,/g, ""));
    if (/billion/i.test(unit)) n *= 1e9;
    else if (/million/i.test(unit)) n *= 1e6;
    else if (/thousand/i.test(unit)) n *= 1e3;
    return n;
  });
  return Math.max(...values);
}

export { oscarAwardsData };
