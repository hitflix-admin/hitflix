// Movie lookup (Wikipedia films only, never users): the round search button in
// the homepage header and the popup it opens. Picking a result opens the movie
// popup (MovieModal) on top, so closing that lands back on these results.

import React, { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { COLORS, inputStyle } from "./theme.js";
import { PosterArt } from "./movieUI.jsx";
import { headerIconButtonStyle } from "./Friends.jsx";

export function MovieSearchButton({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Look up a movie" style={headerIconButtonStyle}>
      <Search size={18} />
    </button>
  );
}

export function MovieSearchModal({ query, setQuery, results, searching, searchError, onSelect, onClose }) {
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.8)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 58,
        padding: "8vh 18px 18px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          borderRadius: 6,
          border: "1px solid rgba(231,233,236,0.1)",
          maxWidth: 480,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: 17,
              letterSpacing: 0.5,
            }}
          >
            Look up a movie
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
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
              flexShrink: 0,
            }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search
            size={16}
            strokeWidth={1.8}
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#8D96A3" }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any movie…"
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>

        {searching && <div style={{ color: "#8D96A3", fontSize: 13 }}>Searching…</div>}
        {searchError && <div style={{ color: COLORS.scarlet, fontSize: 13 }}>{searchError}</div>}
        {!searching && query.trim() && !searchError && results.length === 0 && (
          <div style={{ color: "#8D96A3", fontSize: 13 }}>No titles found for "{query}".</div>
        )}

        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r) => (
              <div
                key={r.id}
                onClick={() => onSelect(r)}
                style={{
                  background: "#141414",
                  border: "1px solid rgba(231,233,236,0.08)",
                  borderRadius: 4,
                  padding: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
