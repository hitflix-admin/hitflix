// Regenerates src/oscarAwards.json from the "the_oscar_award.csv" dataset
// (CC0, github.com/unanimad's Kaggle dataset "The Oscar Award, 1927 - 2026").
// Usage: node scripts/build-oscar-data.mjs path/to/the_oscar_award.csv
//
// Re-run this after each ceremony by grabbing a fresh copy of the CSV
// (columns: year_film,year_ceremony,ceremony,category,name,film,winner).

import fs from "node:fs";

const SMALL_WORDS = new Set(["a", "an", "the", "of", "in", "for", "and", "to"]);

function titleCaseCategory(str) {
  return str.toLowerCase().replace(/[a-z']+/g, (word, offset) => {
    if (offset !== 0 && SMALL_WORDS.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function normalizeTitle(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/build-oscar-data.mjs path/to/the_oscar_award.csv");
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const [header, ...data] = rows;
const col = Object.fromEntries(header.map((name, i) => [name, i]));

const byTitle = {};
for (const r of data) {
  const film = r[col.film]?.trim();
  const yearFilm = parseInt(r[col.year_film], 10);
  if (!film || !Number.isFinite(yearFilm)) continue;

  const key = normalizeTitle(film);
  const category = titleCaseCategory(r[col.category].trim());
  const won = r[col.winner].trim().toLowerCase() === "true";

  byTitle[key] ??= {};
  byTitle[key][yearFilm] ??= { nominations: 0, winners: [] };
  byTitle[key][yearFilm].nominations += 1;
  if (won) byTitle[key][yearFilm].winners.push(category);
}

fs.writeFileSync(
  new URL("../src/oscarAwards.json", import.meta.url),
  JSON.stringify(byTitle)
);
console.log(`Wrote ${Object.keys(byTitle).length} titles to src/oscarAwards.json`);
