// The profile popup: a baseball-card style profile, all-time game stats, and
// achievements. Same popup frame as MovieModal.
//
// Opened for yourself (from the account button) or for someone else (from
// Friends). Friends see each other's card, stats, and awards, read-only;
// anyone else only sees the name, member number, and member-since date, with
// the friend request actions. Ratings are never shown to anyone else.

import React, { useState, useEffect } from "react";
import {
  X,
  Film,
  Pencil,
  Flame,
  Clapperboard,
  Target,
  Zap,
  EyeOff,
  Timer,
  Swords,
  Crosshair,
  LayoutGrid,
  Trophy,
  Ticket,
  Lock,
} from "lucide-react";
import { supabase } from "./supabase.js";
import { COLORS, inputStyle, primaryBtn, secondaryBtn, dangerBtn, segmentBtn, segmentBtnActive } from "./theme.js";
import { PosterArt } from "./movieUI.jsx";
import { searchWikipediaFilms } from "./movieData.js";
import { toMoviePayload } from "./cloudStore.js";
import { recordFinishedGames, markActiveToday } from "./gameResults.js";
import { computeStats, achievementProgress } from "./gameStats.js";
import { todayGameDateString } from "./dailyMovie.js";
import { GAME_INFO } from "./GameCard.jsx";
import StreakBadge from "./StreakBadge.jsx";
import { memberNumberLabel, saveUsername, USERNAME_HINT } from "./Account.jsx";

const CARD_COLORS = ["cobalt", "orchid", "caramel", "fern", "scarlet"];

const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Biography",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Horror",
  "Musical",
  "Mystery",
  "Romance",
  "Romantic Comedy",
  "Sci-Fi",
  "Sports",
  "Thriller",
  "War",
  "Western",
];

const ACHIEVEMENT_ICONS = { Clapperboard, Target, Zap, EyeOff, Timer, Swords, Crosshair, LayoutGrid, Trophy, Flame, Ticket };

const MUTE = "#8D96A3";
const labelStyle = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 800,
  textTransform: "uppercase",
  fontSize: 12,
  letterSpacing: 0.5,
  color: MUTE,
};

const fmtPct = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
const fmtNum = (x, digits = 1) => (x === null || x === undefined ? "—" : x.toFixed(digits));
function fmtTime(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function fromMovieRow(r) {
  return r ? { id: r.id, title: r.title, pageTitle: r.page_title, year: r.year ? String(r.year) : "", poster: r.poster_url } : null;
}

// viewUser: { id, username, member_number, created_at, relation } to view
// someone else; omitted for your own profile. relation is 'friends', 'sent',
// 'received', or 'none'. onRelationChange lets the Friends list refresh after
// a request is sent/accepted/removed from in here.
export default function ProfileModal({ auth, onClose, listsCount, ratingsCount, viewUser, onRelationChange }) {
  const isSelf = !viewUser || viewUser.id === auth.user?.id;
  const targetId = isSelf ? auth.user?.id : viewUser.id;
  const [relation, setRelation] = useState(isSelf ? "self" : viewUser.relation);
  const canSeeDetails = isSelf || relation === "friends";
  const person = isSelf
    ? { username: auth.profile?.username, memberNumber: auth.profile?.member_number, since: auth.user?.created_at }
    : { username: viewUser.username, memberNumber: viewUser.member_number, since: viewUser.created_at };

  const [tab, setTab] = useState("card");
  const [card, setCard] = useState(null); // null = loading
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!canSeeDetails) return;
    let cancelled = false;
    (async () => {
      // your own: make sure today and anything finished on this browser are
      // counted before reading
      if (isSelf) await Promise.all([markActiveToday(), recordFinishedGames()]);
      // filtered to targetId: with friends, these tables also return friends' rows
      const [cardRes, resultsRes, daysRes] = await Promise.all([
        supabase
          .from("profile_cards")
          .select("tagline, favorite_genre, favorite_director, card_color, movie:movies(*)")
          .eq("user_id", targetId)
          .maybeSingle(),
        supabase.from("game_results").select("*").eq("user_id", targetId),
        supabase.from("activity_days").select("day").eq("user_id", targetId),
      ]);
      if (cancelled) return;
      if (cardRes.error || resultsRes.error || daysRes.error) {
        console.error(cardRes.error || resultsRes.error || daysRes.error);
        setLoadError("Couldn't load this profile. Check your connection and try again.");
        return;
      }
      const c = cardRes.data;
      setCard({
        tagline: c?.tagline || "",
        favoriteGenre: c?.favorite_genre || "",
        favoriteDirector: c?.favorite_director || "",
        cardColor: c?.card_color || "cobalt",
        favoriteMovie: fromMovieRow(c?.movie),
      });
      const computed = computeStats(
        resultsRes.data,
        todayGameDateString(),
        daysRes.data.map((r) => r.day)
      );
      setStats(computed);
      // the account button's streak badge reads this too
      if (isSelf) auth.setStreak(computed.streak);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeDetails, targetId]);

  function relationChanged(next) {
    setRelation(next);
    onRelationChange?.();
  }

  const tabs = [
    ["card", "Card"],
    ["stats", "Stats"],
    ["achievements", "Awards"],
    ...(isSelf ? [["account", "Account"]] : []),
  ];

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
          boxSizing: "border-box",
        }}
      >
        {/* tabs size to their labels and share the row with the close button,
            so all four fit even on a 320px-wide phone */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 18 }}>
          {canSeeDetails ? (
            tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setEditing(false);
                }}
                style={{
                  ...(tab === key ? segmentBtnActive : segmentBtn),
                  flex: "1 1 auto",
                  padding: "8px 4px",
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))
          ) : (
            <div style={{ ...labelStyle, flex: 1 }}>Profile</div>
          )}
          <button
            onClick={onClose}
            style={{
              background: "rgba(20,20,20,0.6)",
              border: "none",
              borderRadius: "50%",
              width: 30,
              height: 30,
              flexShrink: 0,
              marginLeft: 4,
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
        </div>

        {!canSeeDetails ? (
          <LockedProfile person={person} userId={viewUser.id} relation={relation} onRelationChange={relationChanged} />
        ) : loadError ? (
          <div style={{ color: MUTE, fontSize: 13.5, padding: "30px 0", textAlign: "center" }}>{loadError}</div>
        ) : !card || !stats ? (
          <div style={{ color: MUTE, fontSize: 13.5, padding: "30px 0", textAlign: "center" }}>Loading profile…</div>
        ) : tab === "card" ? (
          editing ? (
            <CardEditor
              card={card}
              onCancel={() => setEditing(false)}
              onSaved={(next) => {
                setCard(next);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <BaseballCard
                card={card}
                username={person.username}
                memberNumber={person.memberNumber}
                memberSince={person.since}
                stats={stats}
                // ratings and lists are private, so a friend's card shows
                // awards and win rate in those spots instead
                strip={
                  isSelf
                    ? [["Rated", ratingsCount], ["Lists", listsCount]]
                    : [
                        ["Awards", achievementProgress(stats).filter((a) => a.unlocked).length],
                        ["Win rate", fmtPct(stats.overallWinRate)],
                      ]
                }
              />
              {/* kept small so the card itself is the focus */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                {isSelf ? (
                  <button onClick={() => setEditing(true)} style={subtleLinkStyle}>
                    <Pencil size={12} />
                    Edit card
                  </button>
                ) : (
                  <RemoveFriendLink userId={viewUser.id} username={person.username} onRemoved={() => relationChanged("none")} />
                )}
              </div>
            </>
          )
        ) : tab === "account" ? (
          <AccountSection auth={auth} onClose={onClose} />
        ) : tab === "stats" ? (
          <StatsPanel stats={stats} />
        ) : (
          <AchievementsPanel stats={stats} />
        )}
      </div>
    </div>
  );
}

const subtleLinkStyle = {
  background: "none",
  border: "none",
  color: MUTE,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "'Montserrat', sans-serif",
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 2px",
  cursor: "pointer",
};

/* ---------------- Someone else's profile ---------------- */

// Shown to non-friends: who they are, and the friend request actions.
function LockedProfile({ person, userId, relation, onRelationChange }) {
  const since = person.since
    ? new Date(person.since).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  return (
    <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
      <div style={{ fontWeight: 800, fontSize: 22, wordBreak: "break-word" }}>
        {person.username}
        {person.memberNumber && (
          <span style={{ fontSize: 13, fontWeight: 600, color: MUTE, marginLeft: 7 }}>
            {memberNumberLabel(person.memberNumber)}
          </span>
        )}
      </div>
      {since && <div style={{ color: MUTE, fontSize: 12.5, marginTop: 4 }}>Member since {since}</div>}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: MUTE,
          fontSize: 12.5,
          margin: "22px 0 16px",
        }}
      >
        <Lock size={14} />
        Friends can see {person.username}'s card, stats, and awards.
      </div>
      <FriendActions userId={userId} relation={relation} onChange={onRelationChange} />
    </div>
  );
}

// The friend-request buttons for a person, by relation. Also used in the
// Friends list.
export function FriendActions({ userId, relation, onChange, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn, args, next) {
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) {
      console.error(error);
      setError("Something went wrong. Try again.");
      return;
    }
    onChange(typeof data === "string" ? data : next);
  }
  const size = compact ? { padding: "6px 10px", fontSize: 12 } : { padding: "10px 14px", fontSize: 13.5 };
  const btn = (style, label, onClick) => (
    <button onClick={onClick} disabled={busy} style={{ ...style, ...size, flex: compact ? "none" : 1, opacity: busy ? 0.6 : 1 }}>
      {label}
    </button>
  );
  let buttons;
  if (relation === "none") {
    buttons = btn(primaryBtn, "Add friend", () => run("send_friend_request", { target: userId }));
  } else if (relation === "sent") {
    buttons = btn(secondaryBtn, "Cancel request", () => run("remove_friend", { other: userId }, "none"));
  } else if (relation === "received") {
    buttons = (
      <>
        {btn(secondaryBtn, "Decline", () => run("respond_friend_request", { requester_id: userId, accept: false }, "none"))}
        {btn(primaryBtn, "Accept", () => run("respond_friend_request", { requester_id: userId, accept: true }, "friends"))}
      </>
    );
  } else {
    return null;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: compact ? "flex-end" : "center" }}>{buttons}</div>
      {relation === "sent" && !compact && (
        <div style={{ color: MUTE, fontSize: 12, marginTop: 8 }}>Friend request sent</div>
      )}
      {error && <div style={{ color: COLORS.scarlet, fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function RemoveFriendLink({ userId, username, onRemoved }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} style={subtleLinkStyle}>
        Remove friend
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: MUTE }}>
      Remove {username}?
      <button onClick={() => setConfirming(false)} style={{ ...subtleLinkStyle, color: "#E7E9EC" }}>
        Keep
      </button>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { error } = await supabase.rpc("remove_friend", { other: userId });
          setBusy(false);
          if (error) console.error(error);
          else onRemoved();
        }}
        style={{ ...subtleLinkStyle, color: COLORS.scarlet }}
      >
        Remove
      </button>
    </div>
  );
}

/* ---------------- Card ---------------- */

// strip: the last two [label, value] tiles after Streak and Games
function BaseballCard({ card, username, memberNumber, memberSince, stats, strip }) {
  const accent = COLORS[card.cardColor] || COLORS.cobalt;
  const since = memberSince
    ? new Date(memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  const movie = card.favoriteMovie;
  return (
    <div
      style={{
        border: `2px solid ${accent}`,
        borderRadius: 10,
        padding: 14,
        background: `linear-gradient(160deg, ${accent}33 0%, #1E1E1E 55%)`,
      }}
    >
      {/* wraps on narrow phones, with the date staying right-aligned */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          columnGap: 10,
          rowGap: 2,
          marginBottom: 12,
        }}
      >
        <div style={{ ...labelStyle, color: accent, fontSize: 11, letterSpacing: 1.5, whiteSpace: "nowrap" }}>
          Hitflix Movie Club
        </div>
        {since && (
          <div style={{ color: MUTE, fontSize: 11, whiteSpace: "nowrap", marginLeft: "auto" }}>Member since {since}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        {movie ? (
          <div style={{ width: 120, flexShrink: 0, position: "relative" }}>
            <PosterArt poster={movie.poster} title={movie.title} size="fill" />
            <div style={{ position: "absolute", right: -8, bottom: -8 }}>
              <StreakBadge days={stats.streak.current} size={40} />
            </div>
          </div>
        ) : (
          <div style={{ width: 120, flexShrink: 0, position: "relative" }}>
            <div
              style={{
                width: 120,
                aspectRatio: "52 / 76",
                flexShrink: 0,
                borderRadius: 3,
                border: "1px dashed rgba(231,233,236,0.25)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                color: MUTE,
                fontSize: 11,
                textAlign: "center",
                padding: 8,
                boxSizing: "border-box",
              }}
            >
              <Film size={22} />
              Pick a favorite movie
            </div>
            <div style={{ position: "absolute", right: -8, bottom: -8 }}>
              <StreakBadge days={stats.streak.current} size={40} />
            </div>
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {username}
            {memberNumber && (
              <span style={{ fontSize: 12, fontWeight: 600, color: MUTE, marginLeft: 6, whiteSpace: "nowrap" }}>
                {memberNumberLabel(memberNumber)}
              </span>
            )}
          </div>
          {card.tagline && (
            <div style={{ fontStyle: "italic", color: "#E7E9EC", fontSize: 13, lineHeight: 1.4, marginTop: 6 }}>
              “{card.tagline}”
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
            {[
              ["Favorite movie", movie ? `${movie.title}${movie.year ? ` (${movie.year})` : ""}` : null],
              ["Genre", card.favoriteGenre],
              ["Director", card.favoriteDirector],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} style={{ fontSize: 12, color: MUTE, lineHeight: 1.35 }}>
                  <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{label}:</span> {value}
                </div>
              ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 14 }}>
        {[
          ["Streak", stats.streak.current, <Flame key="f" size={13} color={stats.streak.activeToday ? COLORS.caramel : MUTE} />],
          ["Games", stats.totalGames],
          ...strip,
        ].map(([label, value, icon]) => (
          <div
            key={label}
            style={{ background: "rgba(20,20,20,0.55)", borderRadius: 4, padding: "8px 4px", textAlign: "center" }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: 17,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              {icon}
              {value}
            </div>
            <div style={{ ...labelStyle, fontSize: 9.5, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardEditor({ card, onCancel, onSaved }) {
  const [tagline, setTagline] = useState(card.tagline);
  const [genre, setGenre] = useState(card.favoriteGenre);
  const [director, setDirector] = useState(card.favoriteDirector);
  const [color, setColor] = useState(card.cardColor);
  const [movie, setMovie] = useState(card.favoriteMovie);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchWikipediaFilms(query.trim());
        if (!cancelled) setResults(r.slice(0, 5));
      } catch (e) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function save() {
    setSaving(true);
    setError("");
    const { error } = await supabase.rpc("save_profile_card", {
      tagline: tagline.trim(),
      favorite_movie: movie ? toMoviePayload(movie) : null,
      favorite_genre: genre,
      favorite_director: director.trim(),
      card_color: color,
    });
    setSaving(false);
    if (error) {
      console.error(error);
      setError("Couldn't save your card. Try again.");
      return;
    }
    onSaved({ tagline: tagline.trim(), favoriteGenre: genre, favoriteDirector: director.trim(), cardColor: color, favoriteMovie: movie });
  }

  const fieldLabel = { ...labelStyle, display: "block", marginBottom: 6, marginTop: 14 };

  return (
    <div>
      <label style={{ ...fieldLabel, marginTop: 0 }}>Favorite movie (your card picture)</label>
      {movie ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PosterArt poster={movie.poster} title={movie.title} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>
            {movie.title}
            {movie.year && <span style={{ color: MUTE, fontWeight: 400 }}> ({movie.year})</span>}
          </div>
          <button onClick={() => setMovie(null)} style={{ ...secondaryBtn, flex: "none", padding: "6px 10px", fontSize: 12.5 }}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movies…" style={inputStyle} />
          {searching && <div style={{ color: MUTE, fontSize: 12.5, marginTop: 6 }}>Searching…</div>}
          {results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setMovie(r);
                    setQuery("");
                    setResults([]);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#141414",
                    border: "1px solid rgba(231,233,236,0.1)",
                    borderRadius: 3,
                    padding: 6,
                    color: "#E7E9EC",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "'Montserrat', sans-serif",
                  }}
                >
                  <PosterArt poster={r.poster} title={r.title} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: MUTE }}>{r.year || r.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <label style={fieldLabel}>Tagline</label>
      <input
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
        maxLength={120}
        placeholder="e.g. Never skips the credits"
        style={inputStyle}
      />

      <label style={fieldLabel}>Favorite genre</label>
      <select value={genre} onChange={(e) => setGenre(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        {GENRES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <label style={fieldLabel}>Favorite director</label>
      <input
        value={director}
        onChange={(e) => setDirector(e.target.value)}
        maxLength={80}
        placeholder="e.g. Greta Gerwig"
        style={inputStyle}
      />

      <label style={fieldLabel}>Card color</label>
      <div style={{ display: "flex", gap: 10 }}>
        {CARD_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={c}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: COLORS[c],
              border: color === c ? "3px solid #E7E9EC" : "3px solid transparent",
              cursor: "pointer",
              padding: 0,
            }}
          />
        ))}
      </div>

      {error && <div style={{ color: COLORS.scarlet, fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} style={secondaryBtn}>
          Cancel
        </button>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Account settings ---------------- */

// The Account tab: username (changeable), email, sign out, delete account.
function AccountSection({ auth, onClose }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const username = auth.profile?.username || "";

  async function saveName(e) {
    e.preventDefault();
    if (name.trim() === username) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    setError("");
    const problem = await saveUsername(auth.user.id, name);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    auth.setProfile((p) => ({ ...p, username: name.trim() }));
    setEditingName(false);
  }

  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
  const smallBtn = { ...secondaryBtn, flex: "none", padding: "7px 12px", fontSize: 12.5 };

  return (
    <div>

      {editingName ? (
        <form onSubmit={saveName}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            style={inputStyle}
          />
          <div style={{ color: error ? COLORS.scarlet : MUTE, fontSize: 12, marginTop: 6 }}>{error || USERNAME_HINT}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setError("");
              }}
              style={{ ...secondaryBtn, padding: "9px 12px", fontSize: 13 }}
            >
              Cancel
            </button>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, padding: "9px 12px", fontSize: 13, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Save username"}
            </button>
          </div>
        </form>
      ) : (
        <div style={row}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>
              {username}
              {auth.profile?.member_number && (
                <span style={{ fontSize: 11, fontWeight: 600, color: MUTE, marginLeft: 6 }}>
                  {memberNumberLabel(auth.profile.member_number)}
                </span>
              )}
            </div>
            <div style={{ color: MUTE, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{auth.user?.email}</div>
          </div>
          <button
            onClick={() => {
              setName(username);
              setError("");
              setEditingName(true);
            }}
            style={smallBtn}
          >
            Change username
          </button>
        </div>
      )}

      <div style={{ ...row, marginTop: 16 }}>
        <button
          onClick={() => setConfirmingDelete(true)}
          style={{
            background: "none",
            border: "none",
            color: COLORS.scarlet,
            fontSize: 12.5,
            fontWeight: 600,
            padding: 0,
            cursor: "pointer",
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          Delete account
        </button>
        <button
          onClick={async () => {
            await auth.signOut();
            onClose();
          }}
          style={smallBtn}
        >
          Sign out
        </button>
      </div>

      {confirmingDelete && (
        <DeleteAccountConfirm username={username} onCancel={() => setConfirmingDelete(false)} onDeleted={onClose} />
      )}
    </div>
  );
}

// Permanent, so it asks the user to type their username first.
function DeleteAccountConfirm({ username, onCancel, onDeleted }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = typed.trim().toLowerCase() === username.toLowerCase();

  async function deleteAccount() {
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      console.error(error);
      setBusy(false);
      setError("Couldn't delete your account. Try again.");
      return;
    }
    // the account (and its sessions) no longer exist server-side, so only
    // this browser's copy of the session needs clearing
    await supabase.auth.signOut({ scope: "local" });
    onDeleted();
  }

  return (
    <div
      onClick={busy ? undefined : onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
        padding: 18,
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
          boxSizing: "border-box",
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
          Delete your account?
        </div>
        <div style={{ color: MUTE, fontSize: 13, lineHeight: 1.5 }}>
          This permanently deletes your profile card, ratings, game stats, streak, and awards. Lists only you are in
          are deleted; lists you share with others stay with them. Your member number is retired for good.
          <div style={{ marginTop: 8 }}>
            Lists saved in this browser from before you signed in aren't affected.{" "}
            <span style={{ color: "#E7E9EC", fontWeight: 600 }}>This can't be undone.</span>
          </div>
        </div>
        <label style={{ ...labelStyle, display: "block", marginTop: 16, marginBottom: 6 }}>
          Type {username} to confirm
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          style={inputStyle}
        />
        {error && <div style={{ color: COLORS.scarlet, fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} disabled={busy} style={secondaryBtn}>
            Keep account
          </button>
          <button
            onClick={deleteAccount}
            disabled={!matches || busy}
            style={{ ...dangerBtn, opacity: !matches || busy ? 0.45 : 1, cursor: matches && !busy ? "pointer" : "default" }}
          >
            {busy ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Stats ---------------- */

function StatTile({ label, value }) {
  return (
    <div style={{ background: "#141414", borderRadius: 4, padding: "10px 6px", textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{value}</div>
      <div style={{ ...labelStyle, fontSize: 9.5, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function GameHeading({ info }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: info.accent, flexShrink: 0 }} />
      <div style={{ fontWeight: 700, fontSize: 14 }}>{info.title}</div>
    </div>
  );
}

function GuessDistribution({ distribution, losses, accent }) {
  const max = Math.max(1, ...distribution, losses);
  const rows = [...distribution.map((n, i) => [String(i + 1), n]), ["X", losses]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
      {rows.map(([label, n]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <div style={{ width: 10, color: MUTE, textAlign: "right" }}>{label}</div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: `${Math.max(6, (n / max) * 100)}%`,
                background: label === "X" || n === 0 ? "rgba(231,233,236,0.18)" : accent,
                color: "#141414",
                fontWeight: 700,
                borderRadius: 2,
                padding: "2px 6px",
                textAlign: "right",
                boxSizing: "border-box",
                minWidth: 22,
              }}
            >
              <span style={{ color: label === "X" || n === 0 ? "#E7E9EC" : "#141414" }}>{n}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsPanel({ stats }) {
  const guessGames = [GAME_INFO.daily, GAME_INFO.oscarWinner];
  const faceoffGames = [GAME_INFO.faceoff, GAME_INFO.nominationsFaceoff];
  const noGames = stats.totalGames === 0;
  return (
    <div>
      {/* headline: overall win rate, with the games it's based on beside it
          for context; the streaks sit underneath */}
      <div
        style={{
          background: "#141414",
          borderRadius: 4,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 38, lineHeight: 1 }}>{fmtPct(stats.overallWinRate)}</div>
          <div style={{ ...labelStyle, fontSize: 10.5, marginTop: 6 }}>Win rate</div>
        </div>
        <div style={{ color: MUTE, fontSize: 12, lineHeight: 1.4, textAlign: "right" }}>
          <span style={{ color: "#E7E9EC", fontWeight: 700 }}>{stats.guessGamesPlayed}</span>{" "}
          {stats.guessGamesPlayed === 1 ? "game" : "games"} played
          <div style={{ fontSize: 11 }}>Daily Movie games</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 8 }}>
        <StatTile label="Current streak" value={stats.streak.current} />
        <StatTile label="Best streak" value={stats.streak.best} />
      </div>
      <div style={{ color: MUTE, fontSize: 11.5, marginTop: 8, lineHeight: 1.4 }}>
        Win rate covers both Daily Movie games. Your streak counts every day you visit Hitflix while signed in.
      </div>

      {noGames && (
        <div style={{ color: MUTE, fontSize: 13.5, lineHeight: 1.5, textAlign: "center", padding: "24px 6px 6px" }}>
          No games tracked yet. Finish any of today's games while signed in and your game stats will start here.
        </div>
      )}

      {!noGames && guessGames.map((info) => {
        const g = stats.games[info.storageId];
        return (
          <div key={info.storageId}>
            <GameHeading info={info} />
            {g.played === 0 ? (
              <div style={{ color: MUTE, fontSize: 12.5 }}>Not played yet.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  <StatTile label="Win rate" value={fmtPct(g.winRate)} />
                  <StatTile label="Played" value={g.played} />
                  <StatTile label="Avg guesses" value={fmtNum(g.avgGuesses)} />
                  <StatTile label="No-hint wins" value={g.noHintWins} />
                  <StatTile label="Avg time" value={fmtTime(g.avgSeconds)} />
                  <StatTile label="Fastest" value={fmtTime(g.fastestSeconds)} />
                </div>
                <GuessDistribution distribution={g.distribution} losses={g.losses} accent={info.accent} />
              </>
            )}
          </div>
        );
      })}

      {!noGames && faceoffGames.map((info) => {
        const g = stats.games[info.storageId];
        return (
          <div key={info.storageId}>
            <GameHeading info={info} />
            {g.played === 0 ? (
              <div style={{ color: MUTE, fontSize: 12.5 }}>Not played yet.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                <StatTile label="Accuracy" value={fmtPct(g.accuracy)} />
                <StatTile label="Rounds right" value={`${g.roundsCorrect}/${g.rounds}`} />
                <StatTile label="Perfect 5/5" value={g.perfectGames} />
              </div>
            )}
          </div>
        );
      })}

      <div style={{ color: MUTE, fontSize: 11.5, marginTop: 18, lineHeight: 1.4 }}>
        Counts games finished while signed in. Times only count while the game is on screen.
      </div>
    </div>
  );
}

/* ---------------- Achievements ---------------- */

function AchievementsPanel({ stats }) {
  const list = achievementProgress(stats);
  const unlocked = list.filter((a) => a.unlocked).length;
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 12 }}>
        {unlocked} of {list.length} unlocked
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((a) => {
          const Icon = ACHIEVEMENT_ICONS[a.icon] || Trophy;
          return (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#141414",
                borderRadius: 4,
                padding: "10px 12px",
                border: a.unlocked ? `1px solid ${COLORS.caramel}66` : "1px solid transparent",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: a.unlocked ? `${COLORS.caramel}2e` : "rgba(231,233,236,0.06)",
                  color: a.unlocked ? COLORS.caramel : "rgba(231,233,236,0.3)",
                }}
              >
                {a.unlocked ? <Icon size={19} /> : <Lock size={16} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: a.unlocked ? "#E7E9EC" : MUTE }}>{a.title}</div>
                <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.35 }}>{a.description}</div>
                {!a.unlocked && a.goal > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 4, background: "rgba(231,233,236,0.1)", borderRadius: 2 }}>
                      <div
                        style={{
                          width: `${(a.value / a.goal) * 100}%`,
                          height: "100%",
                          background: COLORS.cobalt,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: MUTE }}>
                      {a.value}/{a.goal}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
