// "What's new" popup: opens by itself on any page when there are update
// announcements (whatsNewUpdates.js) this person hasn't seen, oldest first,
// as a carousel. Closing it (✕, the button, or tapping outside) marks every
// one shown as seen — on the account when signed in (0017_whats_new.sql),
// and in this browser either way.

import React, { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "./supabase.js";
import { COLORS, primaryBtn } from "./theme.js";
import { useScrollLock } from "./scrollLock.js";
import { UPDATES } from "./whatsNewUpdates.js";

const BROWSER_KEY = "whatsNewSeen"; // { seen: [ids], since: ISO | null }

// Anything already stored for this site means they've been here before
// (main.jsx imports this module before any page writes its own state).
const VISITED_BEFORE = (() => {
  try {
    return localStorage.length > 0;
  } catch (e) {
    return true;
  }
})();

function readBrowserState() {
  try {
    const saved = JSON.parse(localStorage.getItem(BROWSER_KEY) || "null");
    if (saved && Array.isArray(saved.seen)) return saved;
  } catch (e) {}
  // first time this browser has run this: a returning visitor gets the
  // updates they've missed; a brand-new one starts from now
  const fresh = { seen: [], since: VISITED_BEFORE ? null : new Date().toISOString() };
  writeBrowserState(fresh);
  return fresh;
}

function writeBrowserState(state) {
  try {
    localStorage.setItem(BROWSER_KEY, JSON.stringify(state));
  } catch (e) {}
}

function unseenUpdates(seen, since) {
  const sinceMs = since ? Date.parse(since) : -Infinity;
  return UPDATES.filter((u) => !seen.has(u.id) && Date.parse(u.publishedAt) > sinceMs);
}

export default function WhatsNew() {
  const [updates, setUpdates] = useState([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const browser = readBrowserState();
    (async () => {
      let seen = new Set(browser.seen);
      let since = browser.since;
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setSignedIn(true);
          const { data: row, error } = await supabase.from("whats_new_seen").select("seen, since").maybeSingle();
          if (error) console.error(error);
          // the account decides (no row = an account from before this
          // existed, which gets everything it hasn't seen)
          else {
            since = row?.since ?? null;
            for (const id of row?.seen || []) seen.add(id);
          }
        }
      }
      if (!cancelled) setUpdates(unseenUpdates(seen, since));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!updates.length) return null;

  function close() {
    const ids = updates.map((u) => u.id);
    const browser = readBrowserState();
    writeBrowserState({ ...browser, seen: [...new Set([...browser.seen, ...ids])] });
    if (signedIn) {
      supabase.rpc("mark_whats_new_seen", { update_ids: ids }).then(({ error }) => error && console.error(error));
    }
    setUpdates([]);
  }

  return <WhatsNewModal updates={updates} onClose={close} />;
}

export function WhatsNewModal({ updates, onClose }) {
  useScrollLock();
  const [index, setIndex] = useState(0);
  const update = updates[index];
  const many = updates.length > 1;
  const last = index === updates.length - 1;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, updates.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [updates.length, onClose]);

  function act() {
    onClose();
    const to = update.cta?.to;
    if (to && window.location.pathname !== to) window.location.href = to;
  }

  const arrowBtn = (disabled) => ({
    background: "rgba(231,233,236,0.06)",
    border: "1px solid rgba(231,233,236,0.14)",
    borderRadius: "50%",
    width: 36,
    height: 36,
    color: disabled ? "rgba(231,233,236,0.25)" : "#E7E9EC",
    cursor: disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  });

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
        // above every other popup, awards (70) included; those wait underneath
        zIndex: 75,
        padding: 18,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="What's new on Hitflix"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#1E1E1E",
          borderRadius: 8,
          border: `1px solid ${COLORS.cobalt}55`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          maxWidth: 400,
          width: "100%",
          maxHeight: "min(640px, 85vh, 100%)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: "22px 20px 20px",
          boxSizing: "border-box",
          fontFamily: "'Montserrat', sans-serif",
          color: "#E7E9EC",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
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
        >
          <X size={17} strokeWidth={2} />
        </button>

        <div
          style={{
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            fontSize: 12,
            color: COLORS.cobalt,
            marginBottom: 14,
            paddingRight: 36,
          }}
        >
          What's new{many ? ` · ${index + 1} of ${updates.length}` : ""}
        </div>

        <div
          style={{
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            fontSize: 20,
            lineHeight: 1.2,
            marginBottom: 12,
            overflowWrap: "anywhere",
          }}
        >
          {update.title}
        </div>
        {update.body.map((p, i) => (
          <p key={i} style={{ fontSize: 14, color: "#C9CDD3", lineHeight: 1.55, margin: "0 0 10px" }}>
            {p}
          </p>
        ))}

        {many && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, margin: "16px 0 4px" }}>
            <button
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              aria-label="Previous update"
              style={arrowBtn(index === 0)}
            >
              <ChevronLeft size={18} strokeWidth={2} />
            </button>
            <div style={{ display: "flex", gap: 7 }} aria-hidden="true">
              {updates.map((u, i) => (
                <span
                  key={u.id}
                  onClick={() => setIndex(i)}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    cursor: "pointer",
                    background: i === index ? COLORS.cobalt : "rgba(231,233,236,0.22)",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => setIndex((i) => Math.min(i + 1, updates.length - 1))}
              disabled={last}
              aria-label="Next update"
              style={arrowBtn(last)}
            >
              <ChevronRight size={18} strokeWidth={2} />
            </button>
          </div>
        )}

        <button onClick={act} style={{ ...primaryBtn, width: "100%", marginTop: 14 }}>
          {update.cta?.label || "Got it"}
        </button>
      </div>
    </div>
  );
}
