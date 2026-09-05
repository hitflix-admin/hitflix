import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Plus, GripVertical, Trash2, ArrowLeft, Film, ExternalLink, Check } from "lucide-react";
import logo from "./assets/hitflix-logo-transparent.png";

/* ---------------------------------------------------------
   HITFLIX — a personal film ledger
   Palette:   ink #141414 / surface #1E1E1E / paper #E7E9EC
              blue #6C86AB / rose #B5544B / mute #8D96A3
   Type: "Montserrat" — extrabold + tracked caps for display,
         regular/medium for body
--------------------------------------------------------- */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
`;

const uid = () => Math.random().toString(36).slice(2, 10);

function yearFromDescription(desc) {
  if (!desc) return "";
  const m = desc.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? m[0] : "";
}

const DEFAULT_RATING = { overall: 5, writing: 3, performance: 3, visuals: 3, audio: 3 };
const SUBCATEGORIES = [
  { key: "writing", label: "Writing" },
  { key: "performance", label: "Performance" },
  { key: "visuals", label: "Visuals" },
  { key: "audio", label: "Audio" },
];
const DESCRIPTION_TRUNCATE_LENGTH = 275;

function calcScore(rating) {
  if (!rating) return null;
  const subTotal = rating.writing + rating.performance + rating.visuals + rating.audio;
  const subFrac = subTotal / 20;
  const overallFrac = rating.overall / 10;
  return Math.round(((subFrac + overallFrac) / 2) * 100);
}

function ratingColor(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `hsl(${Math.round(t * 120)}, 65%, 48%)`;
}

function Gauge({ score, size = 44 }) {
  const hasScore = score !== null && score !== undefined;
  const strokeWidth = Math.max(3, size * 0.11);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = hasScore ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const color = hasScore ? ratingColor(score, 0, 100) : "rgba(231,233,236,0.22)";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(231,233,236,0.12)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.25s ease, stroke 0.25s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          color: "#E7E9EC",
          fontSize: hasScore ? size * (score >= 100 ? 0.27 : 0.32) : size * 0.22,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {hasScore ? (
          <>
            {score}
            <span style={{ fontSize: size * (score >= 100 ? 0.135 : 0.16), marginLeft: 1 }}>%</span>
          </>
        ) : (
          <span style={{ color: "#8D96A3" }}>N/A</span>
        )}
      </div>
    </div>
  );
}

const NON_MOVIE_DESCRIPTION = /\b(director|actor|actress|producer|screenwriter|composer|cinematographer|editor|soundtrack|album|score|song|series|franchise|trilogy|registry|studio|festival|award|musician|singer|novel|book|video game|podcast)\b/i;

function isMovieDescription(desc) {
  if (!desc) return false;
  if (!/\bfilm\b/i.test(desc)) return false;
  return !NON_MOVIE_DESCRIPTION.test(desc);
}

async function searchWikipediaFilms(query) {
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
      title: s.title,
      year: yearFromDescription(s.description || s.extract),
      description: s.description || "",
      extract: s.extract || "",
      poster: s.thumbnail ? s.thumbnail.source : null,
      pageUrl: s.content_urls?.desktop?.page || "",
    }))
    .filter((s) => s.title && isMovieDescription(s.description));
}

/* ---------------- Wikipedia infobox parsing ---------------- */

function cleanWikitext(raw) {
  if (!raw) return "";
  let s = raw;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<ref[^>]*\/>/gi, "");
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  s = s.replace(/\{\{(?:Plainlist|plainlist|ubl|hlist|flatlist)\s*\|([\s\S]*?)\}\}/gi, (_, inner) =>
    inner
      .split(/\n?\*/)
      .map((x) => x.trim())
      .filter(Boolean)
      .join(", ")
  );
  s = s.replace(/\{\{(?:small|nowrap|sic|efn|nobr)\|([^{}]*)\}\}/gi, "$1");
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  s = s.replace(/'''''([^']+)'''''/g, "$1");
  s = s.replace(/'''([^']+)'''/g, "$1");
  s = s.replace(/''([^']+)''/g, "$1");
  s = s.replace(/\{\{[^{}]*\}\}/g, "");
  s = s.replace(/\{\{|\}\}/g, "");
  s = s.replace(/<br\s*\/?>/gi, "; ");
  s = s.replace(/<[^>]+>/g, "");
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

async function fetchWikidataAwards(title) {
  try {
    const propsRes = await fetch(
      `https://en.wikipedia.org/w/api.php?origin=*&action=query&prop=pageprops&titles=${encodeURIComponent(
        title
      )}&format=json`
    );
    const propsData = await propsRes.json();
    const page = Object.values(propsData?.query?.pages || {})[0];
    const qid = page?.pageprops?.wikibase_item;
    if (!qid) return { oscarNominations: null, oscarWinners: null };

    const [wonRes, nominatedRes] = await Promise.all([
      fetch(`https://www.wikidata.org/w/api.php?origin=*&action=wbgetclaims&entity=${qid}&property=P166&format=json`),
      fetch(`https://www.wikidata.org/w/api.php?origin=*&action=wbgetclaims&entity=${qid}&property=P1411&format=json`),
    ]);
    const wonData = await wonRes.json();
    const nominatedData = await nominatedRes.json();
    const won = (wonData?.claims?.P166 || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const nominated = (nominatedData?.claims?.P1411 || [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
    const allIds = Array.from(new Set([...won, ...nominated]));
    if (allIds.length === 0) return { oscarNominations: 0, oscarWinners: [] };

    const labelsRes = await fetch(
      `https://www.wikidata.org/w/api.php?origin=*&action=wbgetentities&ids=${allIds.join(
        "|"
      )}&props=labels&languages=en&format=json`
    );
    const labelsData = await labelsRes.json();
    const labelOf = (id) => labelsData?.entities?.[id]?.labels?.en?.value || "";
    const isOscar = (id) => /^Academy Award/i.test(labelOf(id));

    const oscarNominations = nominated.filter(isOscar).length;
    const oscarWinners = won.filter(isOscar).map((id) => labelOf(id).replace(/^Academy Award for /i, ""));

    return { oscarNominations, oscarWinners };
  } catch (e) {
    return { oscarNominations: null, oscarWinners: null };
  }
}

async function fetchMovieDetails(title) {
  try {
    const wikitextRes = await fetch(
      `https://en.wikipedia.org/w/api.php?origin=*&action=parse&page=${encodeURIComponent(
        title
      )}&prop=wikitext&section=0&format=json`
    );
    const wikitextData = await wikitextRes.json();
    const wikitext = wikitextData?.parse?.wikitext?.["*"] || "";
    const fields = parseInfobox(wikitext);

    const releaseDateUS = parseUSReleaseDate(fields.released || fields.release_date) || "Unknown";
    const director = cleanWikitext(fields.director) || "Unknown";
    const budget = cleanWikitext(fields.budget) || "Unknown";
    const boxOffice = cleanWikitext(fields.gross) || "Unknown";

    const awards = await fetchWikidataAwards(title);

    return {
      releaseDateUS,
      director,
      budget,
      boxOffice,
      oscarNominations: awards.oscarNominations,
      oscarWinners: awards.oscarWinners,
    };
  } catch (e) {
    return null;
  }
}

function PosterArt({ poster, title, size = "thumb" }) {
  const initials = (title || "?")
    .split(" ")
    .filter((w) => w.length && /[A-Za-z0-9]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const dims = size === "thumb" ? { w: 52, h: 76 } : { w: 168, h: 244 };
  if (poster) {
    return (
      <img
        src={poster}
        alt={title}
        style={{
          width: dims.w,
          height: dims.h,
          objectFit: "cover",
          borderRadius: 3,
          border: "1px solid rgba(231,233,236,0.14)",
          flexShrink: 0,
          background: "#1E1E1E",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: dims.w,
        height: dims.h,
        borderRadius: 3,
        border: "1px solid rgba(231,233,236,0.14)",
        flexShrink: 0,
        background: "linear-gradient(160deg, #1B2430 0%, #35506B 55%, #6C86AB 130%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#141414",
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 800,
        fontSize: size === "thumb" ? 16 : 36,
        letterSpacing: 0.5,
      }}
    >
      {initials || <Film size={size === "thumb" ? 16 : 28} strokeWidth={1.5} />}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home"); // home | editor
  const [lists, setLists] = useState(null); // null = loading
  const [currentId, setCurrentId] = useState(null);
  const [status, setStatus] = useState(""); // saved indicator
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newName, setNewName] = useState("");
  const [newLength, setNewLength] = useState("");
  const [newRanked, setNewRanked] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [modalRef, setModalRef] = useState(null); // { listId, uid } | null
  const [reviews, setReviews] = useState({}); // movieId -> { rating, details }, shared across all lists

  const dragState = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragY, setDragY] = useState(0);
  const rowRefs = useRef([]);
  const saveTimer = useRef(null);
  const saveReviewsTimer = useRef(null);

  // ---- load ----
  useEffect(() => {
    (async () => {
      let loadedLists = [];
      try {
        const raw = localStorage.getItem("lists");
        loadedLists = raw ? JSON.parse(raw) : [];
      } catch (e) {
        loadedLists = [];
      }
      setLists(loadedLists);

      try {
        const rawReviews = localStorage.getItem("movieReviews");
        if (rawReviews) {
          setReviews(JSON.parse(rawReviews));
        } else {
          // migrate ratings/details that used to live per-list-entry onto the shared-by-id map;
          // when the same movie was rated differently across lists, keep the highest score
          const migrated = {};
          for (const l of loadedLists) {
            const pool = [...(l.entries || []), ...(l.honorableMentions || [])];
            for (const e of pool) {
              if (!e.rating) continue;
              const existingScore = calcScore(migrated[e.id]?.rating);
              const candidateScore = calcScore(e.rating);
              if (!migrated[e.id] || (existingScore ?? -Infinity) < (candidateScore ?? -Infinity)) {
                migrated[e.id] = { rating: e.rating, details: e.details || migrated[e.id]?.details };
              }
            }
          }
          setReviews(migrated);
          if (Object.keys(migrated).length > 0) {
            localStorage.setItem("movieReviews", JSON.stringify(migrated));
          }
        }
      } catch (e) {
        setReviews({});
      }
    })();
  }, []);

  // ---- persist (debounced) ----
  const persist = useCallback((next) => {
    setLists(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("Saving…");
    saveTimer.current = setTimeout(async () => {
      try {
        localStorage.setItem("lists", JSON.stringify(next));
        setStatus("Saved");
      } catch (e) {
        setStatus("Couldn't save");
      }
    }, 500);
  }, []);

  const persistReviews = useCallback((next) => {
    setReviews(next);
    if (saveReviewsTimer.current) clearTimeout(saveReviewsTimer.current);
    setStatus("Saving…");
    saveReviewsTimer.current = setTimeout(() => {
      try {
        localStorage.setItem("movieReviews", JSON.stringify(next));
        setStatus("Saved");
      } catch (e) {
        setStatus("Couldn't save");
      }
    }, 500);
  }, []);

  const currentList = lists && currentId ? lists.find((l) => l.id === currentId) : null;
  const modalList = lists && modalRef ? lists.find((l) => l.id === modalRef.listId) : null;
  const modalEntry =
    modalList && modalRef
      ? modalList.entries.find((e) => e.uid === modalRef.uid) ||
        (modalList.honorableMentions || []).find((e) => e.uid === modalRef.uid)
      : null;
  const modalMovie = modalEntry
    ? { ...modalEntry, rating: reviews[modalEntry.id]?.rating, details: reviews[modalEntry.id]?.details }
    : null;

  function updateCurrent(mutator) {
    if (!lists || !currentId) return;
    const next = lists.map((l) => (l.id === currentId ? mutator(l) : l));
    persist(next);
  }

  function createList() {
    const name = newName.trim() || "Untitled list";
    const cap = parseInt(newLength, 10);
    const list = {
      id: uid(),
      name,
      targetLength: Number.isFinite(cap) && cap > 0 ? cap : 0,
      ranked: newRanked,
      entries: [],
      honorableMentions: [],
      updatedAt: Date.now(),
    };
    const next = [list, ...(lists || [])];
    persist(next);
    setCurrentId(list.id);
    setView("editor");
    setCreating(false);
    setNewName("");
    setNewLength("");
    setNewRanked(true);
  }

  function openList(id) {
    setCurrentId(id);
    setView("editor");
    setQuery("");
    setResults([]);
    setSearchError("");
  }

  function requestDeleteList(id, name, e) {
    e.stopPropagation();
    setDeleteTarget({ id, name });
  }

  function confirmDeleteList() {
    if (!deleteTarget) return;
    const next = (lists || []).filter((l) => l.id !== deleteTarget.id);
    persist(next);
    setDeleteTarget(null);
  }

  function goHome() {
    setView("home");
    setCurrentId(null);
  }

  // ---- search ----
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchError("");
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError("");
    const t = setTimeout(async () => {
      try {
        const r = await searchWikipediaFilms(query.trim());
        if (!cancelled) setResults(r);
      } catch (e) {
        if (!cancelled) setSearchError("Search is unavailable right now. Check your connection and try again.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  function addMovie(movie) {
    if (!currentList) return;
    if (currentList.targetLength > 0 && currentList.entries.length >= currentList.targetLength) return;
    updateCurrent((l) => ({
      ...l,
      entries: [...l.entries, { ...movie, uid: uid() }],
      updatedAt: Date.now(),
    }));
  }

  function addHonorableMention(movie) {
    if (!currentList) return;
    updateCurrent((l) => ({
      ...l,
      honorableMentions: [...(l.honorableMentions || []), { ...movie, uid: uid() }],
      updatedAt: Date.now(),
    }));
  }

  function saveRating(rating) {
    if (!modalEntry) return;
    const id = modalEntry.id;
    persistReviews({ ...reviews, [id]: { ...reviews[id], rating } });
  }

  function removeEntry(uidToRemove) {
    updateCurrent((l) => ({
      ...l,
      entries: l.entries.filter((e) => e.uid !== uidToRemove),
      updatedAt: Date.now(),
    }));
  }

  function removeHonorableMention(uidToRemove) {
    updateCurrent((l) => ({
      ...l,
      honorableMentions: (l.honorableMentions || []).filter((e) => e.uid !== uidToRemove),
      updatedAt: Date.now(),
    }));
  }

  function setMovieDetails(details) {
    if (!modalEntry) return;
    const id = modalEntry.id;
    persistReviews({ ...reviews, [id]: { ...reviews[id], details } });
  }

  // ---- drag reorder (pointer events, mobile-friendly) ----
  function onHandlePointerDown(e, index) {
    e.preventDefault();
    const row = rowRefs.current[index];
    if (!row) return;
    dragState.current = {
      index,
      startY: e.clientY,
      rowHeight: row.getBoundingClientRect().height,
    };
    setDragIndex(index);
    setDragY(0);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragState.current || !currentList) return;
    const { index, startY, rowHeight } = dragState.current;
    const delta = e.clientY - startY;
    setDragY(delta);
    const steps = Math.round(delta / rowHeight);
    if (steps !== 0) {
      const entries = currentList.entries;
      const newIndex = Math.min(Math.max(index + steps, 0), entries.length - 1);
      if (newIndex !== index) {
        const next = entries.slice();
        const [moved] = next.splice(index, 1);
        next.splice(newIndex, 0, moved);
        dragState.current = { index: newIndex, startY: e.clientY, rowHeight };
        setDragIndex(newIndex);
        setDragY(0);
        updateCurrent((l) => ({ ...l, entries: next }));
      }
    }
  }

  function onPointerUp() {
    dragState.current = null;
    setDragIndex(null);
    setDragY(0);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line
  }, []);

  const wrap = {
    fontFamily: "'Montserrat', sans-serif",
    background: "#141414",
    color: "#E7E9EC",
    minHeight: "100%",
    width: "100%",
  };

  if (lists === null) {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <style>{FONTS}</style>
        <div style={{ color: "#8D96A3", fontSize: 14 }}>Loading your lists…</div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <style>{FONTS}</style>
      {view === "home" && (
        <HomeView
          lists={lists}
          reviews={reviews}
          onCreate={() => setCreating(true)}
          onOpen={openList}
          onDelete={requestDeleteList}
          onOpenMovie={(listId, uid) => setModalRef({ listId, uid })}
        />
      )}

      {view === "editor" && currentList && (
        <EditorView
          list={currentList}
          reviews={reviews}
          status={status}
          onBack={goHome}
          onRename={(name) => updateCurrent((l) => ({ ...l, name }))}
          onRecap={(cap) => updateCurrent((l) => ({ ...l, targetLength: cap }))}
          query={query}
          setQuery={setQuery}
          results={results.filter(
            (r) =>
              !currentList.entries.some((e) => e.id === r.id) &&
              !(currentList.honorableMentions || []).some((e) => e.id === r.id)
          )}
          searching={searching}
          searchError={searchError}
          onAdd={addMovie}
          onAddMention={addHonorableMention}
          onRemove={removeEntry}
          onRemoveMention={removeHonorableMention}
          onOpenMovie={(entry) => setModalRef({ listId: currentList.id, uid: entry.uid })}
          rowRefs={rowRefs}
          dragIndex={dragIndex}
          dragY={dragY}
          onHandlePointerDown={onHandlePointerDown}
        />
      )}

      {creating && (
        <CreateModal
          name={newName}
          setName={setNewName}
          length={newLength}
          setLength={setNewLength}
          ranked={newRanked}
          setRanked={setNewRanked}
          onCancel={() => {
            setCreating(false);
            setNewName("");
            setNewLength("");
            setNewRanked(true);
          }}
          onCreate={createList}
        />
      )}

      {modalMovie && (
        <MovieModal
          movie={modalMovie}
          onClose={() => setModalRef(null)}
          onSaveRating={(rating) => saveRating(rating)}
          onDetails={(details) => setMovieDetails(details)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          name={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteList}
        />
      )}
    </div>
  );
}

/* ---------------- Reviewed movies library ---------------- */

function getReviewedMovies(lists, reviews) {
  const byId = new Map();
  for (const l of lists || []) {
    const pool = [...l.entries, ...(l.honorableMentions || [])];
    for (const entry of pool) {
      if (!reviews[entry.id]?.rating) continue;
      if (!byId.has(entry.id)) {
        byId.set(entry.id, { entry, listId: l.id });
      }
    }
  }
  return Array.from(byId.values());
}

function movieSortYear(entry) {
  const y = parseInt(entry.year, 10);
  return Number.isFinite(y) ? y : null;
}

function sortReviewedMovies(items, mode) {
  const sorted = items.slice();
  if (mode === "newest" || mode === "oldest") {
    const dir = mode === "newest" ? -1 : 1;
    sorted.sort((a, b) => {
      const ya = movieSortYear(a.entry);
      const yb = movieSortYear(b.entry);
      if (ya === null && yb === null) return a.entry.title.localeCompare(b.entry.title);
      if (ya === null) return 1;
      if (yb === null) return -1;
      return dir * (ya - yb);
    });
  } else {
    sorted.sort((a, b) => a.entry.title.localeCompare(b.entry.title));
  }
  return sorted;
}

const SORT_OPTIONS = [
  { key: "alpha", label: "A–Z" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
];

function ReviewedLibrary({ lists, reviews, onOpenMovie }) {
  const [sortMode, setSortMode] = useState("alpha");
  const reviewed = sortReviewedMovies(getReviewedMovies(lists, reviews), sortMode);

  return (
    <div style={{ marginTop: 34 }}>
      <div
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: 17,
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Your reviews
      </div>
      <div style={{ color: "#8D96A3", fontSize: 12.5, marginBottom: 14 }}>
        {reviewed.length} title{reviewed.length === 1 ? "" : "s"} reviewed
      </div>

      {reviewed.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(231,233,236,0.18)",
            borderRadius: 4,
            padding: "30px 20px",
            textAlign: "center",
            color: "#8D96A3",
            fontSize: 14,
          }}
        >
          Rate a title in one of your lists and it'll show up here.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSortMode(opt.key)}
                style={sortMode === opt.key ? segmentBtnActive : segmentBtn}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
            {reviewed.map(({ entry, listId }) => (
              <div
                key={`${listId}-${entry.uid}`}
                onClick={() => onOpenMovie(listId, entry.uid)}
                style={{
                  background: "#1E1E1E",
                  border: "1px solid rgba(231,233,236,0.08)",
                  borderRadius: 4,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <PosterArt poster={entry.poster} title={entry.title} size="thumb" />
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    textAlign: "center",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: 1.25,
                    width: "100%",
                  }}
                >
                  {entry.title}
                </div>
                <Gauge score={calcScore(reviews[entry.id]?.rating)} size={34} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Home ---------------- */

function HomeView({ lists, reviews, onCreate, onOpen, onDelete, onOpenMovie }) {
  return (
    <div style={{ padding: "28px 18px 40px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 26 }}>
        <img
          src={logo}
          alt="Hitflix Movie Club"
          style={{ height: 84, width: "auto", maxWidth: "100%", display: "block" }}
        />
        <div style={{ color: "#8D96A3", fontSize: 13.5, marginTop: 6 }}>
          Build a list, one reel at a time.
        </div>
      </div>

      <button
        onClick={onCreate}
        style={{
          width: "100%",
          background: "#6C86AB",
          color: "#141414",
          border: "none",
          borderRadius: 3,
          padding: "13px 16px",
          fontSize: 15,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          cursor: "pointer",
          marginBottom: 28,
        }}
      >
        <Plus size={18} strokeWidth={2.5} />
        New list
      </button>

      {lists.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(231,233,236,0.18)",
            borderRadius: 4,
            padding: "36px 20px",
            textAlign: "center",
            color: "#8D96A3",
            fontSize: 14,
          }}
        >
          No lists yet. Start one above — give it a name, decide how many titles it holds, then search to fill it in.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lists
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((l) => (
              <div
                key={l.id}
                onClick={() => onOpen(l.id)}
                style={{
                  background: "#1E1E1E",
                  border: "1px solid rgba(231,233,236,0.08)",
                  borderRadius: 4,
                  padding: "14px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", marginRight: 2 }}>
                  {l.entries.slice(0, 3).map((e, i) => (
                    <div key={e.uid} style={{ marginLeft: i === 0 ? 0 : -18, zIndex: 3 - i }}>
                      <PosterArt poster={e.poster} title={e.title} size="thumb" />
                    </div>
                  ))}
                  {l.entries.length === 0 && (
                    <div
                      style={{
                        width: 52,
                        height: 76,
                        borderRadius: 3,
                        border: "1px dashed rgba(231,233,236,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#8D96A3",
                      }}
                    >
                      <Film size={16} strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.name}
                  </div>
                  <div style={{ color: "#8D96A3", fontSize: 12.5 }}>
                    {l.entries.length}
                    {l.targetLength ? ` / ${l.targetLength}` : ""} titles
                  </div>
                </div>
                <button
                  onClick={(e) => onDelete(l.id, l.name, e)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#8D96A3",
                    cursor: "pointer",
                    padding: 6,
                  }}
                  aria-label="Delete list"
                >
                  <Trash2 size={17} strokeWidth={1.6} />
                </button>
              </div>
            ))}
        </div>
      )}

      <ReviewedLibrary lists={lists} reviews={reviews} onOpenMovie={onOpenMovie} />
    </div>
  );
}

/* ---------------- Create modal ---------------- */

function CreateModal({ name, setName, length, setLength, ranked, setRanked, onCancel, onCreate }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          width: "100%",
          maxWidth: 480,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          borderRadius: 10,
          padding: "22px 20px 26px",
          border: "1px solid rgba(231,233,236,0.1)",
        }}
      >
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, textTransform: "uppercase", fontSize: 21, letterSpacing: 0.4, marginBottom: 16 }}>
          New list
        </div>
        <label style={{ display: "block", fontSize: 12.5, color: "#8D96A3", marginBottom: 6 }}>List name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sunday night rewatches"
          style={inputStyle}
        />
        <label style={{ display: "block", fontSize: 12.5, color: "#8D96A3", margin: "16px 0 6px" }}>
          How many titles? (optional)
        </label>
        <input
          type="number"
          min="1"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          placeholder="Leave blank for no limit"
          style={inputStyle}
        />
        <label style={{ display: "block", fontSize: 12.5, color: "#8D96A3", margin: "16px 0 6px" }}>
          List type
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setRanked(true)}
            style={ranked ? segmentBtnActive : segmentBtn}
          >
            Ranked
          </button>
          <button
            type="button"
            onClick={() => setRanked(false)}
            style={!ranked ? segmentBtnActive : segmentBtn}
          >
            Unranked
          </button>
        </div>
        <div style={{ color: "#8D96A3", fontSize: 12, marginTop: 7 }}>
          {ranked
            ? "Titles are numbered 1, 2, 3… from top to bottom."
            : "Titles have no set order."}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onCancel} style={secondaryBtn}>
            Cancel
          </button>
          <button onClick={onCreate} style={primaryBtn}>
            Create list
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Delete confirmation modal ---------------- */

function ConfirmDeleteModal({ name, onCancel, onConfirm }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 55,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          width: "100%",
          maxWidth: 400,
          borderRadius: 10,
          padding: "22px 20px 20px",
          border: "1px solid rgba(231,233,236,0.1)",
        }}
      >
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: 19,
            letterSpacing: 0.4,
            marginBottom: 10,
          }}
        >
          Delete list?
        </div>
        <div style={{ color: "#8D96A3", fontSize: 13.5, lineHeight: 1.5, marginBottom: 22 }}>
          Are you sure you want to delete <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{name}</span>? This
          can't be undone.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={secondaryBtn}>
            Don't Delete
          </button>
          <button onClick={onConfirm} style={dangerBtn}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#141414",
  border: "1px solid rgba(231,233,236,0.15)",
  borderRadius: 3,
  padding: "11px 12px",
  color: "#E7E9EC",
  fontSize: 14.5,
  fontFamily: "'Montserrat', sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

const primaryBtn = {
  flex: 1,
  background: "#6C86AB",
  color: "#141414",
  border: "none",
  borderRadius: 3,
  padding: "12px 14px",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn = {
  flex: 1,
  background: "transparent",
  color: "#E7E9EC",
  border: "1px solid rgba(231,233,236,0.2)",
  borderRadius: 3,
  padding: "12px 14px",
  fontSize: 14.5,
  cursor: "pointer",
};

const dangerBtn = {
  flex: 1,
  background: "#B5544B",
  color: "#E7E9EC",
  border: "none",
  borderRadius: 3,
  padding: "12px 14px",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
};

const segmentBtn = {
  flex: 1,
  background: "#141414",
  color: "#E7E9EC",
  border: "1px solid rgba(231,233,236,0.15)",
  borderRadius: 3,
  padding: "10px 14px",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Montserrat', sans-serif",
};

const segmentBtnActive = {
  ...segmentBtn,
  background: "#6C86AB",
  color: "#141414",
  border: "1px solid #6C86AB",
};

/* ---------------- Editor ---------------- */

function EditorView({
  list,
  reviews,
  status,
  onBack,
  onRename,
  onRecap,
  query,
  setQuery,
  results,
  searching,
  searchError,
  onAdd,
  onAddMention,
  onRemove,
  onRemoveMention,
  onOpenMovie,
  rowRefs,
  dragIndex,
  dragY,
  onHandlePointerDown,
}) {
  const honorableMentions = list.honorableMentions || [];
  const full = list.targetLength > 0 && list.entries.length >= list.targetLength;
  const [editingName, setEditingName] = useState(false);

  return (
    <div style={{ paddingBottom: 60 }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "#141414",
          borderBottom: "1px solid rgba(231,233,236,0.08)",
          padding: "14px 16px 12px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button onClick={onBack} style={iconBtn} aria-label="Back to lists">
            <ArrowLeft size={19} strokeWidth={1.8} />
          </button>
          {editingName ? (
            <input
              autoFocus
              defaultValue={list.name}
              onBlur={(e) => {
                onRename(e.target.value.trim() || "Untitled list");
                setEditingName(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              style={{
                ...inputStyle,
                flex: 1,
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 20,
                letterSpacing: 0.4,
                padding: "4px 8px",
              }}
            />
          ) : (
            <div
              onClick={() => setEditingName(true)}
              style={{
                flex: 1,
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 21,
                letterSpacing: 0.4,
                cursor: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {list.name}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#8D96A3", flexShrink: 0 }}>{status}</div>
        </div>
        <div style={{ color: "#8D96A3", fontSize: 12.5 }}>
          {list.entries.length}
          {list.targetLength ? ` / ${list.targetLength}` : ""} titles · {list.ranked ? "ranked" : "unranked"} · drag the handle to reorder
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        {list.entries.length === 0 && (
          <div
            style={{
              border: "1px dashed rgba(231,233,236,0.18)",
              borderRadius: 4,
              padding: "26px 18px",
              textAlign: "center",
              color: "#8D96A3",
              fontSize: 13.5,
              marginBottom: 18,
            }}
          >
            Search below to add your first title.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
          {list.entries.map((entry, i) => (
            <div
              key={entry.uid}
              ref={(el) => (rowRefs.current[i] = el)}
              style={{
                background: "#1E1E1E",
                border: "1px solid rgba(231,233,236,0.08)",
                borderRadius: 4,
                padding: "10px 10px 10px 6px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                transform: dragIndex === i ? `translateY(${dragY}px)` : "none",
                boxShadow: dragIndex === i ? "0 8px 20px rgba(0,0,0,0.45)" : "none",
                zIndex: dragIndex === i ? 5 : 1,
                position: "relative",
                touchAction: "none",
              }}
            >
              <div
                onPointerDown={(e) => onHandlePointerDown(e, i)}
                style={{
                  color: "#8D96A3",
                  cursor: "grab",
                  padding: "10px 4px",
                  touchAction: "none",
                }}
                aria-label="Drag to reorder"
              >
                <GripVertical size={18} strokeWidth={1.6} />
              </div>
              {list.ranked && (
                <div
                  style={{
                    width: 22,
                    flexShrink: 0,
                    textAlign: "center",
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 15,
                    color: "#6C86AB",
                  }}
                >
                  {i + 1}
                </div>
              )}
              <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                <PosterArt poster={entry.poster} title={entry.title} size="thumb" />
              </div>
              <div onClick={() => onOpenMovie(entry)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#8D96A3",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {entry.year || "Year unknown"}
                  {reviews[entry.id]?.details?.director ? ` · Dir. ${reviews[entry.id].details.director}` : ""}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  flexShrink: 0,
                  width: 60,
                }}
              >
                {calcScore(reviews[entry.id]?.rating) !== null ? (
                  <>
                    <div
                      className="your-score-label"
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        fontWeight: 700,
                        color: "#8D96A3",
                      }}
                    >
                      Your score
                    </div>
                    <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                      <Gauge score={calcScore(reviews[entry.id]?.rating)} size={40} />
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => onOpenMovie(entry)}
                    style={{
                      background: "transparent",
                      border: "1px solid #6C86AB",
                      color: "#6C86AB",
                      borderRadius: 20,
                      padding: "6px 10px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      fontFamily: "'Montserrat', sans-serif",
                    }}
                  >
                    Add score
                  </button>
                )}
              </div>
              <button
                onClick={() => onRemove(entry.uid)}
                style={{ background: "none", border: "none", color: "#8D96A3", cursor: "pointer", padding: 6 }}
                aria-label={`Remove ${entry.title}`}
              >
                <X size={17} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>

        {list.ranked && (
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 15,
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Honorable mentions
            </div>
            <div style={{ color: "#8D96A3", fontSize: 12, marginBottom: 10 }}>No particular order</div>

            {honorableMentions.length === 0 ? (
              <div
                style={{
                  border: "1px dashed rgba(231,233,236,0.18)",
                  borderRadius: 4,
                  padding: "20px 16px",
                  textAlign: "center",
                  color: "#8D96A3",
                  fontSize: 13,
                }}
              >
                No honorable mentions yet.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 6,
                }}
              >
                {honorableMentions.map((entry) => (
                  <div
                    key={entry.uid}
                    style={{
                      background: "#1E1E1E",
                      border: "1px solid rgba(231,233,236,0.08)",
                      borderRadius: 4,
                      padding: 10,
                      width: 116,
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      position: "relative",
                    }}
                  >
                    <button
                      onClick={() => onRemoveMention(entry.uid)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: "rgba(20,20,20,0.7)",
                        border: "none",
                        borderRadius: "50%",
                        width: 22,
                        height: 22,
                        color: "#8D96A3",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      aria-label={`Remove ${entry.title}`}
                    >
                      <X size={13} strokeWidth={1.8} />
                    </button>
                    <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                      <PosterArt poster={entry.poster} title={entry.title} size="thumb" />
                    </div>
                    <div
                      onClick={() => onOpenMovie(entry)}
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        textAlign: "center",
                        cursor: "pointer",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        lineHeight: 1.25,
                        width: "100%",
                      }}
                    >
                      {entry.title}
                    </div>
                    {calcScore(reviews[entry.id]?.rating) !== null ? (
                      <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                        <Gauge score={calcScore(reviews[entry.id]?.rating)} size={34} />
                      </div>
                    ) : (
                      <button
                        onClick={() => onOpenMovie(entry)}
                        style={{
                          background: "transparent",
                          border: "1px solid #6C86AB",
                          color: "#6C86AB",
                          borderRadius: 20,
                          padding: "4px 8px",
                          fontSize: 9.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          fontFamily: "'Montserrat', sans-serif",
                        }}
                      >
                        Add score
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ borderTop: "1px solid rgba(231,233,236,0.08)", paddingTop: 18 }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, textTransform: "uppercase", fontSize: 15, letterSpacing: 0.5, marginBottom: 10 }}>
            Add a title
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search
              size={16}
              strokeWidth={1.8}
              style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#8D96A3" }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movie titles…"
              disabled={full}
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>

          {full && (
            <div style={{ color: "#B5544B", fontSize: 13, marginBottom: 8 }}>
              This list is full ({list.entries.length}/{list.targetLength}). Remove a title to add another.
            </div>
          )}
          {!full && searching && <div style={{ color: "#8D96A3", fontSize: 13 }}>Searching…</div>}
          {!full && searchError && <div style={{ color: "#B5544B", fontSize: 13 }}>{searchError}</div>}
          {!full && !searching && query.trim() && !searchError && results.length === 0 && (
            <div style={{ color: "#8D96A3", fontSize: 13 }}>No titles found for "{query}".</div>
          )}

          {!full && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: "#1E1E1E",
                    border: "1px solid rgba(231,233,236,0.08)",
                    borderRadius: 4,
                    padding: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <PosterArt poster={r.poster} title={r.title} size="thumb" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#8D96A3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.description || r.year}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => onAdd(r)}
                      style={{
                        background: "#6C86AB",
                        border: "none",
                        borderRadius: 3,
                        color: "#141414",
                        padding: "8px 10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      <Plus size={14} strokeWidth={2.5} />
                      Add
                    </button>
                    {list.ranked && (
                      <button
                        onClick={() => onAddMention(r)}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(231,233,236,0.2)",
                          borderRadius: 3,
                          color: "#8D96A3",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: 10.5,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          fontFamily: "'Montserrat', sans-serif",
                        }}
                      >
                        Mention
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtn = {
  background: "none",
  border: "none",
  color: "#E7E9EC",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  flexShrink: 0,
};

/* ---------------- Movie modal ---------------- */

function MovieModal({ movie, onClose, onSaveRating, onDetails }) {
  const [expanded, setExpanded] = useState(false);
  const hasExistingRating = !!movie.rating;
  const savedRating = movie.rating || DEFAULT_RATING;
  const [draftRating, setDraftRating] = useState(savedRating);
  const hasChanges = JSON.stringify(draftRating) !== JSON.stringify(savedRating);
  const showValues = hasExistingRating || hasChanges;
  const score = showValues ? calcScore(draftRating) : null;
  const saveButtonLabel = !hasChanges ? "Return to list" : hasExistingRating ? "Update rating" : "Add rating";
  const extract = movie.extract || "";
  const isLong = extract.length > DESCRIPTION_TRUNCATE_LENGTH;
  const shownExtract = expanded || !isLong ? extract : extract.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd() + "…";

  useEffect(() => {
    if (movie.details) return;
    let cancelled = false;
    (async () => {
      const details = await fetchMovieDetails(movie.title);
      if (!cancelled && details) onDetails(details);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.uid]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          borderRadius: 6,
          border: "1px solid rgba(231,233,236,0.1)",
          maxWidth: 420,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: 20,
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "rgba(20,20,20,0.6)",
            border: "none",
            borderRadius: "50%",
            width: 30,
            height: 30,
            color: "#E7E9EC",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Close"
        >
          <X size={17} strokeWidth={2} />
        </button>

        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <PosterArt poster={movie.poster} title={movie.title} size="large" />
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, textTransform: "uppercase", fontSize: 19, letterSpacing: 0.3, lineHeight: 1.15, marginBottom: 6 }}>
              {movie.title}
            </div>
            {!movie.details ? (
              <div style={{ color: "#8D96A3", fontSize: 12.5 }}>Loading details…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {[
                  ["Release Date", movie.details.releaseDateUS],
                  ["Director", movie.details.director],
                  ["Budget", movie.details.budget],
                  ["Box Office", movie.details.boxOffice],
                  ["Oscar Nominations", movie.details.oscarNominations ?? "Unknown"],
                  [
                    "Oscar Winners",
                    movie.details.oscarWinners === null
                      ? "Unknown"
                      : movie.details.oscarWinners.length === 0
                      ? "None"
                      : movie.details.oscarWinners.join(", "),
                  ],
                ].map(([label, value]) => (
                  <div key={label} style={{ fontSize: 12, color: "#8D96A3", lineHeight: 1.4 }}>
                    <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{label}:</span> {value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {extract && (
          <div style={{ color: "#E7E9EC", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14 }}>
            {shownExtract}
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6C86AB",
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: 0,
                  marginLeft: 6,
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
            {expanded && movie.pageUrl && (
              <div style={{ marginTop: 8 }}>
                <a
                  href={movie.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#6C86AB",
                    fontSize: 12.5,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    textDecoration: "none",
                  }}
                >
                  More on Wikipedia
                  <ExternalLink size={12} strokeWidth={2} />
                </a>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            borderTop: "1px solid rgba(231,233,236,0.1)",
            marginTop: 4,
            marginBottom: 14,
            paddingTop: 16,
          }}
        >
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: 13,
              letterSpacing: 0.5,
              color: "#8D96A3",
              marginBottom: 12,
            }}
          >
            Your rating
          </div>

          {/* Section 1: total calculated score */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Gauge score={score} size={132} />
          </div>

          {/* Section 2 (overall, left) + Section 3 (subcategories, right) */}
          <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8D96A3" }}>
                <span>Overall</span>
                <span style={{ color: "#E7E9EC", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {showValues ? `${draftRating.overall}/10` : "N/A"}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={draftRating.overall}
                onChange={(e) => setDraftRating((r) => ({ ...r, overall: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {SUBCATEGORIES.map((cat) => {
                const value = draftRating[cat.key];
                const color = showValues ? ratingColor(value, 1, 5) : "#4a525c";
                return (
                  <div key={cat.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8D96A3" }}>
                      <span>{cat.label}</span>
                      <span style={{ color: showValues ? color : "#8D96A3", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {showValues ? `${value}/5` : "N/A"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={value}
                      onChange={(e) => setDraftRating((r) => ({ ...r, [cat.key]: Number(e.target.value) }))}
                      style={{ width: "100%", accentColor: color }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            if (hasChanges) onSaveRating(draftRating);
            onClose();
          }}
          style={{ ...primaryBtn, width: "100%", marginTop: 18 }}
        >
          {saveButtonLabel}
        </button>
      </div>
    </div>
  );
}
