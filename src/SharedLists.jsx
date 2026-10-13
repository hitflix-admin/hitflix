// Collaborative lists (0011_collaborative_lists.sql): list invites from
// friends (a home-screen banner and a section in the Friends popup), the
// Share popup (invite friends, the list's join link), and the "Join this
// list?" prompt a join link opens.

import React, { useState, useEffect, useCallback } from "react";
import { X, Users, Link2, Check } from "lucide-react";
import { supabase } from "./supabase.js";
import { COLORS, primaryBtn, secondaryBtn } from "./theme.js";
import { useScrollLock } from "./scrollLock.js";

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
          Anyone signed in who opens this link can join and edit the list.
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
              Resetting or turning off stops the current link from working. People already on the list stay on it.
            </div>
          </>
        )}
      </div>

      {error && <div style={{ color: COLORS.scarlet, fontSize: 13, marginTop: 12 }}>{error}</div>}
    </Popup>
  );
}

// "Join this list?" for a join link.
export function JoinListModal({ token, signedIn, onSignIn, onJoined, onClose }) {
  const [info, setInfo] = useState(undefined); // undefined = loading, null = link dead
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.rpc("join_link_info", { link_token: token });
      if (cancelled) return;
      if (e) {
        console.error(e);
        setError("Couldn't load this link. Check your connection and try again.");
        setInfo(null);
      } else setInfo(data[0] || null);
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
      setError(/20 members/.test(e.message) ? "This list is full — it already has 20 members." : "Couldn't join. Try again.");
    } else onJoined(data);
  }

  if (!signedIn) {
    return (
      <Popup title="Join a list" onClose={onClose} maxWidth={400}>
        <div style={{ color: MUTE, fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>
          Someone shared a Hitflix list with you. Sign in (or make a free account) to see it and join.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={secondaryBtn}>
            Not now
          </button>
          <button onClick={onSignIn} style={primaryBtn}>
            Sign in
          </button>
        </div>
      </Popup>
    );
  }

  return (
    <Popup title={info ? "Join list?" : "Join a list"} onClose={onClose} maxWidth={400}>
      {info === undefined ? (
        <div style={{ color: MUTE, fontSize: 13.5 }}>Loading…</div>
      ) : info === null ? (
        <>
          <div style={{ color: MUTE, fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>
            {error || "This link doesn't work anymore — it may have been reset or turned off. Ask someone on the list for a new one."}
          </div>
          <button onClick={onClose} style={{ ...secondaryBtn, width: "100%" }}>
            OK
          </button>
        </>
      ) : (
        <>
          <div style={{ background: "#141414", borderRadius: 4, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, overflowWrap: "anywhere" }}>{info.list_name}</div>
            <div style={{ color: MUTE, fontSize: 12.5, marginTop: 3 }}>
              {plural(Number(info.entry_count), "title")} · {plural(Number(info.member_count), "member")}
            </div>
          </div>
          <div style={{ color: MUTE, fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
            {info.already_member
              ? "You're already on this list."
              : "Everyone on the list can add, remove, reorder, and rename. Your ratings stay private."}
          </div>
          {error && <div style={{ color: COLORS.scarlet, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={secondaryBtn}>
              {info.already_member ? "Close" : "Not now"}
            </button>
            <button disabled={busy} onClick={info.already_member ? () => onJoined(info.list_id) : join} style={primaryBtn}>
              {info.already_member ? "Open list" : busy ? "Joining…" : "Join list"}
            </button>
          </div>
        </>
      )}
    </Popup>
  );
}
