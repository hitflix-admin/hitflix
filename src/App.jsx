import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Plus, GripVertical, Trash2, ArrowLeft, Film, ExternalLink, Check } from "lucide-react";

/* ---------------------------------------------------------
   HITFLIX — a personal film ledger
   Palette:   ink #12181C / surface #1C262D / paper #EDE7DA
              gold #D4A24C / rose #B5544B / mute #7E8E96
   Display type: "Bebas Neue" (marquee letterforms)
   Body type:    "Work Sans"
--------------------------------------------------------- */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Work+Sans:wght@400;500;600&display=swap');
`;

const uid = () => Math.random().toString(36).slice(2, 10);

function yearFromDescription(desc) {
  if (!desc) return "";
  const m = desc.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? m[0] : "";
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
    .filter((s) => s.title);
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
          border: "1px solid rgba(237,231,218,0.14)",
          flexShrink: 0,
          background: "#1C262D",
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
        border: "1px solid rgba(237,231,218,0.14)",
        flexShrink: 0,
        background: "linear-gradient(160deg, #3A2E1E 0%, #6B4E23 55%, #D4A24C 130%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#12181C",
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: size === "thumb" ? 18 : 40,
        letterSpacing: 1,
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
  const [newName, setNewName] = useState("");
  const [newLength, setNewLength] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [modalMovie, setModalMovie] = useState(null);

  const dragState = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragY, setDragY] = useState(0);
  const rowRefs = useRef([]);
  const saveTimer = useRef(null);

  // ---- load ----
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("lists");
        setLists(raw ? JSON.parse(raw) : []);
      } catch (e) {
        setLists([]);
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

  const currentList = lists && currentId ? lists.find((l) => l.id === currentId) : null;

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
      entries: [],
      updatedAt: Date.now(),
    };
    const next = [list, ...(lists || [])];
    persist(next);
    setCurrentId(list.id);
    setView("editor");
    setCreating(false);
    setNewName("");
    setNewLength("");
  }

  function openList(id) {
    setCurrentId(id);
    setView("editor");
    setQuery("");
    setResults([]);
    setSearchError("");
  }

  function deleteList(id, e) {
    e.stopPropagation();
    const next = (lists || []).filter((l) => l.id !== id);
    persist(next);
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

  function removeEntry(uidToRemove) {
    updateCurrent((l) => ({
      ...l,
      entries: l.entries.filter((e) => e.uid !== uidToRemove),
      updatedAt: Date.now(),
    }));
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
    fontFamily: "'Work Sans', sans-serif",
    background: "#12181C",
    color: "#EDE7DA",
    minHeight: "100%",
    width: "100%",
  };

  if (lists === null) {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <style>{FONTS}</style>
        <div style={{ color: "#7E8E96", fontSize: 14 }}>Loading your lists…</div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <style>{FONTS}</style>
      {view === "home" && (
        <HomeView
          lists={lists}
          onCreate={() => setCreating(true)}
          onOpen={openList}
          onDelete={deleteList}
        />
      )}

      {view === "editor" && currentList && (
        <EditorView
          list={currentList}
          status={status}
          onBack={goHome}
          onRename={(name) => updateCurrent((l) => ({ ...l, name }))}
          onRecap={(cap) => updateCurrent((l) => ({ ...l, targetLength: cap }))}
          query={query}
          setQuery={setQuery}
          results={results}
          searching={searching}
          searchError={searchError}
          onAdd={addMovie}
          onRemove={removeEntry}
          onOpenMovie={setModalMovie}
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
          onCancel={() => {
            setCreating(false);
            setNewName("");
            setNewLength("");
          }}
          onCreate={createList}
        />
      )}

      {modalMovie && <MovieModal movie={modalMovie} onClose={() => setModalMovie(null)} />}
    </div>
  );
}

/* ---------------- Home ---------------- */

function HomeView({ lists, onCreate, onOpen, onDelete }) {
  return (
    <div style={{ padding: "28px 18px 40px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 26 }}>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 40,
            letterSpacing: 1.5,
            lineHeight: 1,
            color: "#EDE7DA",
          }}
        >
          Hitflix
        </div>
        <div style={{ color: "#7E8E96", fontSize: 13.5, marginTop: 6 }}>
          Build a list, one reel at a time.
        </div>
      </div>

      <button
        onClick={onCreate}
        style={{
          width: "100%",
          background: "#D4A24C",
          color: "#12181C",
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
            border: "1px dashed rgba(237,231,218,0.18)",
            borderRadius: 4,
            padding: "36px 20px",
            textAlign: "center",
            color: "#7E8E96",
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
                  background: "#1C262D",
                  border: "1px solid rgba(237,231,218,0.08)",
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
                        border: "1px dashed rgba(237,231,218,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#7E8E96",
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
                  <div style={{ color: "#7E8E96", fontSize: 12.5 }}>
                    {l.entries.length}
                    {l.targetLength ? ` / ${l.targetLength}` : ""} titles
                  </div>
                </div>
                <button
                  onClick={(e) => onDelete(l.id, e)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#7E8E96",
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
    </div>
  );
}

/* ---------------- Create modal ---------------- */

function CreateModal({ name, setName, length, setLength, onCancel, onCreate }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,13,15,0.72)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1C262D",
          width: "100%",
          maxWidth: 480,
          borderRadius: "10px 10px 0 0",
          padding: "22px 20px 26px",
          border: "1px solid rgba(237,231,218,0.1)",
          borderBottom: "none",
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 1, marginBottom: 16 }}>
          New list
        </div>
        <label style={{ display: "block", fontSize: 12.5, color: "#7E8E96", marginBottom: 6 }}>List name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sunday night rewatches"
          style={inputStyle}
        />
        <label style={{ display: "block", fontSize: 12.5, color: "#7E8E96", margin: "16px 0 6px" }}>
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

const inputStyle = {
  width: "100%",
  background: "#12181C",
  border: "1px solid rgba(237,231,218,0.15)",
  borderRadius: 3,
  padding: "11px 12px",
  color: "#EDE7DA",
  fontSize: 14.5,
  fontFamily: "'Work Sans', sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

const primaryBtn = {
  flex: 1,
  background: "#D4A24C",
  color: "#12181C",
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
  color: "#EDE7DA",
  border: "1px solid rgba(237,231,218,0.2)",
  borderRadius: 3,
  padding: "12px 14px",
  fontSize: 14.5,
  cursor: "pointer",
};

/* ---------------- Editor ---------------- */

function EditorView({
  list,
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
  onRemove,
  onOpenMovie,
  rowRefs,
  dragIndex,
  dragY,
  onHandlePointerDown,
}) {
  const full = list.targetLength > 0 && list.entries.length >= list.targetLength;
  const [editingName, setEditingName] = useState(false);

  return (
    <div style={{ paddingBottom: 60 }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "#12181C",
          borderBottom: "1px solid rgba(237,231,218,0.08)",
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
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 24,
                padding: "4px 8px",
              }}
            />
          ) : (
            <div
              onClick={() => setEditingName(true)}
              style={{
                flex: 1,
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 26,
                letterSpacing: 0.5,
                cursor: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {list.name}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#7E8E96", flexShrink: 0 }}>{status}</div>
        </div>
        <div style={{ color: "#7E8E96", fontSize: 12.5 }}>
          {list.entries.length}
          {list.targetLength ? ` / ${list.targetLength}` : ""} titles · drag the handle to reorder
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        {list.entries.length === 0 && (
          <div
            style={{
              border: "1px dashed rgba(237,231,218,0.18)",
              borderRadius: 4,
              padding: "26px 18px",
              textAlign: "center",
              color: "#7E8E96",
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
                background: "#1C262D",
                border: "1px solid rgba(237,231,218,0.08)",
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
                  color: "#7E8E96",
                  cursor: "grab",
                  padding: "10px 4px",
                  touchAction: "none",
                }}
                aria-label="Drag to reorder"
              >
                <GripVertical size={18} strokeWidth={1.6} />
              </div>
              <div onClick={() => onOpenMovie(entry)} style={{ cursor: "pointer" }}>
                <PosterArt poster={entry.poster} title={entry.title} size="thumb" />
              </div>
              <div onClick={() => onOpenMovie(entry)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.title}
                </div>
                <div style={{ fontSize: 12, color: "#7E8E96" }}>{entry.year || "Year unknown"}</div>
              </div>
              <button
                onClick={() => onRemove(entry.uid)}
                style={{ background: "none", border: "none", color: "#7E8E96", cursor: "pointer", padding: 6 }}
                aria-label={`Remove ${entry.title}`}
              >
                <X size={17} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid rgba(237,231,218,0.08)", paddingTop: 18 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, letterSpacing: 0.5, marginBottom: 10 }}>
            Add a title
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search
              size={16}
              strokeWidth={1.8}
              style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#7E8E96" }}
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
          {!full && searching && <div style={{ color: "#7E8E96", fontSize: 13 }}>Searching…</div>}
          {!full && searchError && <div style={{ color: "#B5544B", fontSize: 13 }}>{searchError}</div>}
          {!full && !searching && query.trim() && !searchError && results.length === 0 && (
            <div style={{ color: "#7E8E96", fontSize: 13 }}>No titles found for "{query}".</div>
          )}

          {!full && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: "#1C262D",
                    border: "1px solid rgba(237,231,218,0.08)",
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
                    <div style={{ fontSize: 11.5, color: "#7E8E96", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.description || r.year}
                    </div>
                  </div>
                  <button
                    onClick={() => onAdd(r)}
                    style={{
                      background: "#D4A24C",
                      border: "none",
                      borderRadius: 3,
                      color: "#12181C",
                      padding: "8px 10px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12.5,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    Add
                  </button>
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
  color: "#EDE7DA",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  flexShrink: 0,
};

/* ---------------- Movie modal ---------------- */

function MovieModal({ movie, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,13,15,0.8)",
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
          background: "#1C262D",
          borderRadius: 6,
          border: "1px solid rgba(237,231,218,0.1)",
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
            background: "rgba(18,24,28,0.6)",
            border: "none",
            borderRadius: "50%",
            width: 30,
            height: 30,
            color: "#EDE7DA",
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
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 0.5, lineHeight: 1.05, marginBottom: 6 }}>
              {movie.title}
            </div>
            <div style={{ color: "#D4A24C", fontSize: 13, marginBottom: 8 }}>{movie.year || "Year unknown"}</div>
            {movie.description && (
              <div style={{ color: "#7E8E96", fontSize: 12.5, lineHeight: 1.4 }}>{movie.description}</div>
            )}
          </div>
        </div>

        {movie.extract && (
          <div style={{ color: "#EDE7DA", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14 }}>
            {movie.extract}
          </div>
        )}

        {movie.pageUrl && (
          <a
            href={movie.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#D4A24C",
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
        )}

        <button
          onClick={onClose}
          style={{ ...primaryBtn, width: "100%", marginTop: 18 }}
        >
          Back to list
        </button>
      </div>
    </div>
  );
}
