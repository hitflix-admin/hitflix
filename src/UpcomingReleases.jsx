import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { PosterArt } from "./movieUI.jsx";
import { useScrollLock } from "./scrollLock.js";

// "Coming to Theaters" on the homepage: the major upcoming US releases from
// public/upcoming.json (built daily by scripts/build-upcoming-releases.mjs),
// grouped by opening weekend, soonest first. The homepage shows only the
// next weekend; "See more" opens a scrolling popup with the full year. A
// Wednesday/Thursday opening (Thanksgiving, Christmas week) counts toward
// that week's Friday weekend.

const WEEKENDS_SHOWN = 1; // the rest open in the "See more" popup

// Same reset zone as the daily games, so "today" flips at the same moment
// for everyone. Kept local rather than imported from dailyMovie.js, which
// would pull the games' datasets into the homepage bundle.
function todayString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Dates are calendar days, so do the math in UTC to dodge DST/zone shifts.
const toUTC = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUTC = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);

// The Friday of the weekend a release opens into: Fri/Sat/Sun → that
// weekend's Friday; Mon–Thu → the coming Friday.
function weekendFriday(dateString) {
  const d = toUTC(dateString);
  const dow = d.getUTCDay(); // 0 Sun … 5 Fri, 6 Sat
  const offset = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return fromUTC(d);
}

const fmt = (s, opts) => toUTC(s).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

function weekendLabel(friday, today) {
  const sunday = fromUTC(new Date(toUTC(friday).getTime() + 2 * 864e5));
  const sameMonth = friday.slice(5, 7) === sunday.slice(5, 7);
  const range = `${fmt(friday, { month: "short", day: "numeric" })}–${fmt(
    sunday,
    sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" }
  )}`;
  const thisFriday = weekendFriday(today);
  if (friday === thisFriday) return `This weekend · ${range}`;
  if (daysBetween(thisFriday, friday) === 7) return `Next weekend · ${range}`;
  return range;
}

function countdown(releaseDate, today) {
  const n = daysBetween(today, releaseDate);
  if (n <= 0) return "Out today";
  if (n === 1) return "Tomorrow";
  return `In ${n} days`;
}

function groupByWeekend(films, today) {
  const groups = new Map();
  for (const f of films) {
    if (f.releaseDate < today) continue; // stale file: already out
    const key = weekendFriday(f.releaseDate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([friday, list]) => ({
      friday,
      films: list.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate)),
    }));
}

function UpcomingFilmRow({ film, today, onOpen }) {
  const studio = film.studio.split(" / ")[0];
  return (
    <button type="button" className="upcoming-film" onClick={() => onOpen(film)}>
      <PosterArt poster={film.poster} title={film.title} size="thumb" />
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.25,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {film.title}
        </div>
        <div style={{ color: "#8D96A3", fontSize: 12, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {fmt(film.releaseDate, { weekday: "short", month: "short", day: "numeric" })}
          {studio ? ` · ${studio}` : ""}
        </div>
        <div style={{ color: "#6E99D4", fontSize: 11.5, fontWeight: 600, marginTop: 4 }}>
          {countdown(film.releaseDate, today)}
        </div>
      </div>
    </button>
  );
}

function WeekendGroup({ weekend, today, onOpen, sticky = false }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "#E7E9EC",
          padding: "6px 0",
          marginBottom: 8,
          borderBottom: "1px solid rgba(231,233,236,0.1)",
          ...(sticky ? { position: "sticky", top: 0, zIndex: 1, background: "#1E1E1E" } : {}),
        }}
      >
        {weekendLabel(weekend.friday, today)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {weekend.films.map((f) => (
          <UpcomingFilmRow key={f.id} film={f} today={today} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// "See more": every weekend in the file (about a year out) in a scrolling
// popup. Opening a film stacks the movie popup on top (MovieModal sits at
// z-index 60), so closing it lands you back here where you were.
function UpcomingModal({ weekends, today, onOpen, onClose }) {
  useScrollLock();
  useEffect(() => {
    // Only when this popup is on top — a movie opened from it stacks above,
    // and Escape shouldn't close the list out from under it.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (!top || top.closest(".upcoming-modal-backdrop")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const filmCount = weekends.reduce((n, w) => n + w.films.length, 0);

  return (
    <div className="upcoming-modal-backdrop" onClick={onClose}>
      <div
        className="upcoming-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Coming to Theaters"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 20px 12px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 19,
                letterSpacing: 0.4,
              }}
            >
              Coming to Theaters
            </div>
            <div style={{ color: "#8D96A3", fontSize: 12.5, marginTop: 3 }}>
              {filmCount} major releases over the next year
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#8D96A3", cursor: "pointer", padding: 4, margin: -4 }}
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
        <div className="upcoming-modal-scroll">
          {weekends.map((w) => (
            <WeekendGroup key={w.friday} weekend={w} today={today} onOpen={onOpen} sticky />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UpcomingReleases({ onOpenMovie }) {
  const [films, setFilms] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const closeAll = useCallback(() => setShowAll(false), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/upcoming.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && setFilms(data?.films || []))
      .catch(() => !cancelled && setFilms([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayString();
  const weekends = films ? groupByWeekend(films, today) : [];
  if (films && weekends.length === 0) return null;

  function open(film) {
    onOpenMovie({
      id: film.id,
      title: film.title,
      pageTitle: film.pageTitle,
      year: film.releaseDate.slice(0, 4),
      description: film.description,
      extract: film.extract,
      poster: film.poster,
      pageUrl: film.pageUrl,
    });
  }

  return (
    <section id="coming-soon" className="home-section-anchor">
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
        Coming to Theaters
      </div>
      <div style={{ color: "#8D96A3", fontSize: 12.5, marginBottom: 14 }}>
        The biggest upcoming releases, by opening weekend.
      </div>

      {!films ? (
        <div style={{ color: "#6B7280", fontSize: 12.5 }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {weekends.slice(0, WEEKENDS_SHOWN).map((w) => (
            <WeekendGroup key={w.friday} weekend={w} today={today} onOpen={open} />
          ))}
          {weekends.length > WEEKENDS_SHOWN && (
            <button type="button" className="upcoming-more" onClick={() => setShowAll(true)}>
              See more upcoming releases
            </button>
          )}
        </div>
      )}

      {showAll && <UpcomingModal weekends={weekends} today={today} onOpen={open} onClose={closeAll} />}
    </section>
  );
}
