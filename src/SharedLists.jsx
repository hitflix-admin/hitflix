// Collaborative lists (0011_collaborative_lists.sql, 0012_view_shared_lists.sql):
// list invites from friends (a home-screen banner and a section in the
// Friends popup), the Share popup (invite friends, the list's join link), and
// the read-only page a join link opens — viewable by anyone, joinable when
// signed in.

import React, { useState, useEffect, useCallback } from "react";
import { X, Users, Link2, Check, ArrowLeft } from "lucide-react";
import { supabase } from "./supabase.js";
import { COLORS, primaryBtn, secondaryBtn } from "./theme.js";
import { useScrollLock } from "./scrollLock.js";
import { PosterArt, Gauge, calcScore } from "./movieUI.jsx";
import { fromMovieRow } from "./cloudStore.js";

const MUTE = "#8D96A3";
const labelStyle = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 800,
  textTransform: "uppercase",
  fontSize: 12,
  letterSpacing: 0.5,
  color: MUTE,
};
const smallBtn = {
  background: "transparent",
  border: "1px solid rgba(231,233,236,0.2)",
  color: "#E7E9EC",
  borderRadius: 3,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontFamily: "'Montserrat', sans-serif",
  flexShrink: 0,
};
const smallPrimaryBtn = { ...smallBtn, background: COLORS.cobalt, border: `1px solid ${COLORS.cobalt}`, color: "#141414" };

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------- join link in the URL
// hitflix.club/?join=<token>. The token is kept in localStorage until it's
// answered, so it survives signing in (including through an emailed link,
// which comes back to the bare site).
const JOIN_KEY = "pendingJoinToken";
const TOKEN_RE = /^[0-9a-f]{32}$/;

export function takeJoinTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("join");
    if (!token) return null;
    url.searchParams.delete("join");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (!TOKEN_RE.test(token)) return null;
    try {
      localStorage.setItem(JOIN_KEY, token);
    } catch (e) {}
    return token;
  } catch (e) {
    return null;
  }
}

export function readPendingJoinToken() {
  try {
    const t = localStorage.getItem(JOIN_KEY);
    return t && TOKEN_RE.test(t) ? t : null;
  } catch (e) {
    return null;
  }
}

export function clearPendingJoinToken() {
  try {
    localStorage.removeItem(JOIN_KEY);
  } catch (e) {}
}

const joinUrl = (token) => `${window.location.origin}/?join=${token}`;

// ---------------------------------------------------------------- invites you received
export function useListInvites(userId) {
  const [invites, setInvites] = useState([]);
  const refresh = useCallback(async () => {
    if (!userId) {
      setInvites([]);
      return;
    }
    const { data, error } = await supabase.rpc("my_list_invites");
    if (error) console.error(error);
    else setInvites(data);
  }, [userId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // accept = join the list
  const respond = useCallback(
    async (listId, accept) => {
      setInvites((all) => all.filter((i) => i.list_id !== listId));
      const { error } = await supabase.rpc("respond_list_invite", { target_list: listId, accept });
      if (error) {
        console.error(error);
        refresh();
        return false;
      }
      return true;
    },
    [refresh]
  );
  return { invites, refresh, respond };
}

function InviteRow({ invite, listInvites, onJoined }) {
  const [busy, setBusy] = useState(false);
  async function answer(accept) {
    setBusy(true);
    const ok = await listInvites.respond(invite.list_id, accept);
    setBusy(false);
    if (ok && accept) onJoined(invite.list_id);
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        background: "#141414",
        borderRadius: 4,
        padding: "9px 10px",
      }}
    >
      {/* the buttons drop below the name when there isn't room beside it */}
      <div style={{ flex: "1 1 150px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{invite.list_name}</div>
        <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>
          {invite.inviter_username ? `from ${invite.inviter_username} · ` : ""}
          {plural(Number(invite.entry_count), "title")} · {plural(Number(invite.member_count), "member")}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={busy} onClick={() => answer(false)} style={smallBtn}>
          Decline
        </button>
        <button disabled={busy} onClick={() => answer(true)} style={smallPrimaryBtn}>
          Join
        </button>
      </div>
    </div>
  );
}

export function ListInvitesSection({ listInvites, onJoined }) {
  if (listInvites.invites.length === 0) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ ...labelStyle, marginBottom: 8 }}>List invites · {listInvites.invites.length}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {listInvites.invites.map((i) => (
          <InviteRow key={i.list_id} invite={i} listInvites={listInvites} onJoined={onJoined} />
        ))}
      </div>
    </div>
  );
}

export function ListInvitesBanner({ listInvites, onJoined }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.cobalt}55`,
        background: "#1E1E1E",
        borderRadius: 4,
        padding: "12px 12px 10px",
        marginBottom: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, ...labelStyle, color: COLORS.cobalt, marginBottom: 8 }}>
        <Users size={14} strokeWidth={2.2} />
        {listInvites.invites.length === 1 ? "You're invited to a list" : `You're invited to ${listInvites.invites.length} lists`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {listInvites.invites.map((i) => (
          <InviteRow key={i.list_id} invite={i} listInvites={listInvites} onJoined={onJoined} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- popups
function Popup({ title, onClose, children, maxWidth = 420 }) {
  useScrollLock();
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
        zIndex: 58,
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1E1E1E",
          borderRadius: 6,
          border: "1px solid rgba(231,233,236,0.1)",
          maxWidth,
          width: "100%",
          maxHeight: "min(640px, 85vh, 100%)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: 19,
              letterSpacing: 0.4,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {title}
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
              flexShrink: 0,
              color: "#E7E9EC",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Share: who's on the list, invite friends, and the join link.
export function ShareListModal({ list, userId, friends, onClose }) {
  const [invited, setInvited] = useState(null); // Set of friend ids with a pending invite; null = loading
  const [link, setLink] = useState(undefined); // undefined = loading, null = none
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const memberIds = new Set((list.members || []).map((m) => m.id));
  const friendList = friends.people.filter((p) => p.relation === "friends");

  useEffect(() => {
    friends.refresh();
    let cancelled = false;
    (async () => {
      const [inv, lnk] = await Promise.all([
        supabase.from("list_invites").select("invitee").eq("list_id", list.id),
        supabase.from("list_join_links").select("token").eq("list_id", list.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (inv.error) console.error(inv.error);
      if (lnk.error) console.error(lnk.error);
      setInvited(new Set((inv.data || []).map((r) => r.invitee)));
      setLink(lnk.data?.token ?? null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.id]);

  async function toggleInvite(friendId) {
    setError("");
    const wasInvited = invited.has(friendId);
    setInvited((s) => {
      const next = new Set(s);
      if (wasInvited) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
    const { error: e } = wasInvited
      ? await supabase.rpc("cancel_list_invite", { target_list: list.id, friend: friendId })
      : await supabase.rpc("invite_to_list", { target_list: list.id, friend: friendId });
    if (e) {
      console.error(e);
      setError("Couldn't update that invite. Try again.");
      setInvited((s) => {
        const next = new Set(s);
        if (wasInvited) next.add(friendId);
        else next.delete(friendId);
        return next;
      });
    }
  }

  async function makeLink(reset) {
    setBusy(true);
    setError("");
    setCopied(false);
    const { data, error: e } = await supabase.rpc("get_join_link", { target_list: list.id, reset });
    setBusy(false);
    if (e) {
      console.error(e);
      setError("Couldn't make a link. Try again.");
    } else setLink(data);
  }

  async function turnOffLink() {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("disable_join_link", { target_list: list.id });
    setBusy(false);
    if (e) {
      console.error(e);
      setError("Couldn't turn the link off. Try again.");
    } else {
      setLink(null);
      setCopied(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl(link));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // clipboard blocked: the link is shown selectable below
      setError("Couldn't copy — press and hold the link to copy it.");
    }
  }

  return (
    <Popup title="Share list" onClose={onClose}>
      <div style={{ color: MUTE, fontSize: 13, lineHeight: 1.5 }}>
        Everyone on <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{list.name}</span> can add, remove, reorder, and
        rename. Ratings stay private — each person only sees their own.
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>On this list · {(list.members || []).length}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(list.members || []).map((m) => (
            <span
              key={m.id}
              style={{ background: "#141414", borderRadius: 14, padding: "5px 11px", fontSize: 12.5, fontWeight: 600 }}
            >
              {m.id === userId ? `${m.username} (you)` : m.username}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Invite friends</div>
        {friendList.length === 0 ? (
          <div style={{ color: MUTE, fontSize: 13, lineHeight: 1.5 }}>
            No friends yet — add some from the Friends button on the home screen, or share the link below.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {friendList.map((f) => {
              const member = memberIds.has(f.id);
              const isInvited = invited?.has(f.id);
              return (
                <div
                  key={f.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "#141414", borderRadius: 4, padding: "8px 10px" }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflowWrap: "anywhere" }}>{f.username}</span>
                  {member ? (
                    <span style={{ color: MUTE, fontSize: 12 }}>On the list</span>
                  ) : (
                    <button
                      disabled={invited === null}
                      onClick={() => toggleInvite(f.id)}
                      style={isInvited ? smallBtn : smallPrimaryBtn}
                    >
                      {isInvited ? "Invited ✓" : "Invite"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Join link</div>
        <div style={{ color: MUTE, fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }}>
          Anyone with this link can view the list — no account needed. Signed-in people can also join and edit it.
        </div>
        {link === undefined ? (
          <div style={{ color: MUTE, fontSize: 13 }}>Loading…</div>
        ) : link === null ? (
          <button disabled={busy} onClick={() => makeLink(false)} style={{ ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Link2 size={16} strokeWidth={2.2} />
            Create join link
          </button>
        ) : (
          <>
            <div
              style={{
                background: "#141414",
                borderRadius: 3,
                padding: "10px 12px",
                fontSize: 12.5,
                color: "#E7E9EC",
                wordBreak: "break-all",
                userSelect: "all",
                WebkitUserSelect: "all",
                marginBottom: 8,
              }}
            >
              {joinUrl(link)}
            </div>
            <button
              disabled={busy}
              onClick={copyLink}
              style={{ ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
            >
              {copied ? <Check size={16} strokeWidth={2.4} /> : <Link2 size={16} strokeWidth={2.2} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button disabled={busy} onClick={() => makeLink(true)} style={{ ...secondaryBtn, fontSize: 13, padding: "9px 10px" }}>
                Reset link
              </button>
              <button disabled={busy} onClick={turnOffLink} style={{ ...secondaryBtn, fontSize: 13, padding: "9px 10px" }}>
                Turn off
              </button>
            </div>
            <div style={{ color: "#6B7280", fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
              Resetting or turning off stops the current link from working for viewing and joining. People already on
              the list stay on it.
            </div>
          </>
        )}
      </div>

      {error && <div style={{ color: COLORS.scarlet, fontSize: 13, marginTop: 12 }}>{error}</div>}
    </Popup>
  );
}

// What a join link opens: the list, read-only, for anyone — signed out
// included. Signed in, you can also join it to edit.
export function SharedListView({ token, signedIn, reviews, onSignIn, onOpenMovie, onJoined, onClose }) {
  const [list, setList] = useState(undefined); // undefined = loading, null = link dead
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // reloaded on sign-in, since "already on this list" depends on who's asking
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.rpc("view_shared_list", { link_token: token });
      if (cancelled) return;
      if (e) {
        console.error(e);
        setLoadError("Couldn't load this list. Check your connection and try again.");
        setList(null);
        return;
      }
      setLoadError("");
      if (!data) {
        setList(null);
        return;
      }
      const toMovie = (en) => fromMovieRow(en.movie);
      setList({
        ...data,
        entries: data.entries.filter((en) => en.section === "main").map(toMovie),
        honorableMentions: data.entries.filter((en) => en.section === "honorable").map(toMovie),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, signedIn]);

  async function join() {
    setBusy(true);
    setError("");
    const { data, error: e } = await supabase.rpc("join_list_by_link", { link_token: token });
    setBusy(false);
    if (e) {
      console.error(e);
      setError(
        /20 members/.test(e.message)
          ? "This list is full — it already has 20 members."
          : /no longer works/.test(e.message)
          ? "This link was just turned off or reset, so it can't be used to join."
          : "Couldn't join. Try again."
      );
    } else onJoined(data);
  }

  const header = (
    <div
      style={{
        position: "sticky",
        top: 0,
        background: "#141414",
        borderBottom: "1px solid rgba(231,233,236,0.08)",
        padding: "14px 1cm 12px",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onClose}
          aria-label="Go to Hitflix"
          style={{ background: "none", border: "none", color: "#E7E9EC", cursor: "pointer", padding: 4, display: "flex" }}
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </button>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: 21,
            letterSpacing: 0.4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {list ? list.name : "Shared list"}
        </div>
      </div>
      {list && (
        <div style={{ color: MUTE, fontSize: 12.5, marginTop: 6 }}>
          {list.shared_by ? `Shared by ${list.shared_by} · ` : ""}
          {plural(list.entries.length, "title")} · {plural(Number(list.member_count), "member")}
        </div>
      )}
    </div>
  );

  if (list === undefined || list === null) {
    return (
      <div style={{ paddingBottom: 60 }}>
        {header}
        <div style={{ padding: "26px 1cm 0", color: MUTE, fontSize: 14, lineHeight: 1.5 }}>
          {list === undefined
            ? "Loading…"
            : loadError ||
              "This link doesn't work anymore — it may have been reset or turned off. Ask someone on the list for a new one."}
          {list === null && (
            <div style={{ marginTop: 18 }}>
              <button onClick={onClose} style={{ ...secondaryBtn, flex: "none", padding: "10px 16px" }}>
                Go to Hitflix
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const scoreOf = (movie) => calcScore(reviews?.[movie.id]?.rating);

  return (
    <div style={{ paddingBottom: 130 }}>
      {header}
      <div style={{ padding: "14px 1cm 0" }}>
        {list.entries.length === 0 && (
          <div
            style={{
              border: "1px dashed rgba(231,233,236,0.18)",
              borderRadius: 4,
              padding: "26px 18px",
              textAlign: "center",
              color: MUTE,
              fontSize: 13.5,
              marginBottom: 18,
            }}
          >
            Nothing on this list yet.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
          {list.entries.map((movie, i) => (
            <div
              key={movie.id}
              onClick={() => onOpenMovie(movie)}
              style={{
                background: "#1E1E1E",
                border: "1px solid rgba(231,233,236,0.08)",
                borderRadius: 4,
                padding: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
            >
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
                    color: COLORS.cobalt,
                  }}
                >
                  {i + 1}
                </div>
              )}
              <PosterArt poster={movie.poster} title={movie.title} size="thumb" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {movie.title}
                </div>
                <div style={{ fontSize: 12, color: MUTE }}>{movie.year || "Year unknown"}</div>
              </div>
              {/* the viewer's own rating, if they have one — never anyone else's */}
              {scoreOf(movie) !== null && <Gauge score={scoreOf(movie)} size={44} />}
            </div>
          ))}
        </div>

        {list.honorableMentions.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: 15,
                letterSpacing: 0.5,
                marginBottom: 10,
              }}
            >
              Honorable mentions
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
              {list.honorableMentions.map((movie) => (
                <div
                  key={movie.id}
                  onClick={() => onOpenMovie(movie)}
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
                    cursor: "pointer",
                  }}
                >
                  <PosterArt poster={movie.poster} title={movie.title} size="thumb" />
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
                    {movie.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* pinned to the bottom of the screen */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#141414",
          borderTop: "1px solid rgba(231,233,236,0.1)",
          padding: "12px 18px calc(12px + env(safe-area-inset-bottom))",
          zIndex: 20,
        }}
      >
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          {error && <div style={{ color: COLORS.scarlet, fontSize: 13, marginBottom: 8 }}>{error}</div>}
          {!signedIn ? (
            <button onClick={onSignIn} style={{ ...primaryBtn, width: "100%" }}>
              Sign in to join and edit
            </button>
          ) : list.already_member ? (
            <button onClick={() => onJoined(list.list_id)} style={{ ...primaryBtn, width: "100%" }}>
              You're on this list — open it
            </button>
          ) : (
            <button disabled={busy} onClick={join} style={{ ...primaryBtn, width: "100%" }}>
              {busy ? "Joining…" : "Join to edit"}
            </button>
          )}
          <div style={{ color: "#6B7280", fontSize: 11.5, textAlign: "center", marginTop: 7 }}>
            {!signedIn
              ? "Anyone can view this list. Members can add, remove, reorder, and rename."
              : list.already_member
              ? "Your ratings stay private on shared lists."
              : "Members can add, remove, reorder, and rename. Your ratings stay private."}
          </div>
        </div>
      </div>
    </div>
  );
}
