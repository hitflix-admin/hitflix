// Friends: the people button beside the account button (with a count of
// pending requests), and the Friends popup — username search, incoming and
// sent requests, and your friends. Tapping a person opens their profile
// (ProfileModal with viewUser).

import React, { useState, useEffect, useCallback } from "react";
import { Users, X, Search, ChevronRight } from "lucide-react";
import { supabase } from "./supabase.js";
import { COLORS, inputStyle } from "./theme.js";
import { memberNumberLabel } from "./Account.jsx";
import { FriendActions } from "./Profile.jsx";

const MUTE = "#8D96A3";
const labelStyle = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 800,
  textTransform: "uppercase",
  fontSize: 12,
  letterSpacing: 0.5,
  color: MUTE,
};

// Everyone you have a friendship row with: { id, username, member_number,
// created_at, relation: 'friends' | 'sent' | 'received' }.
export function useFriends(userId) {
  const [people, setPeople] = useState([]);
  const refresh = useCallback(async () => {
    if (!userId) {
      setPeople([]);
      return;
    }
    const { data, error } = await supabase.rpc("list_friends");
    if (error) console.error(error);
    else setPeople(data);
  }, [userId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return {
    people,
    refresh,
    incomingCount: people.filter((p) => p.relation === "received").length,
  };
}

// Round icon button used in the homepage header (Friends, movie search).
export const headerIconButtonStyle = {
  position: "relative",
  width: 42,
  height: 42,
  flexShrink: 0,
  borderRadius: "50%",
  background: "#1E1E1E",
  border: "1px solid rgba(231,233,236,0.14)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
  color: "#E7E9EC",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

export function FriendsButton({ count, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={count ? `Friends, ${count} new request${count === 1 ? "" : "s"}` : "Friends"}
      style={headerIconButtonStyle}
    >
      <Users size={18} />
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            padding: "0 5px",
            boxSizing: "border-box",
            background: COLORS.scarlet,
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 800,
            fontFamily: "'Montserrat', sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #141414",
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

function PersonRow({ person, onOpen, onRelationChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#141414",
        borderRadius: 4,
        padding: "8px 10px",
      }}
    >
      <button
        onClick={() => onOpen(person)}
        style={{
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          padding: 0,
          color: "#E7E9EC",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "'Montserrat', sans-serif",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, overflowWrap: "anywhere" }}>{person.username}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: MUTE, flexShrink: 0 }}>
          {memberNumberLabel(person.member_number)}
        </span>
        {person.relation === "friends" && <ChevronRight size={15} color={MUTE} style={{ marginLeft: "auto", flexShrink: 0 }} />}
      </button>
      {person.relation === "self" ? (
        <span style={{ color: MUTE, fontSize: 12 }}>You</span>
      ) : person.relation !== "friends" ? (
        <FriendActions
          compact
          userId={person.id}
          relation={person.relation}
          onChange={(next) => onRelationChange(person, next)}
        />
      ) : null}
    </div>
  );
}

export function FriendsModal({ friends, onClose, onOpenProfile }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = not searching
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    friends.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_profiles", { query: q });
      if (cancelled) return;
      setSearching(false);
      if (error) {
        console.error(error);
        setResults([]);
      } else setResults(data);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  function relationChanged() {
    friends.refresh();
  }

  // search results take their relation from the (refreshed) friends list, so a
  // request sent or accepted anywhere — here or from someone's profile — shows
  // up in the results too
  const relationOf = (r) =>
    r.relation === "self" ? "self" : friends.people.find((p) => p.id === r.id)?.relation ?? "none";

  const incoming = friends.people.filter((p) => p.relation === "received");
  const accepted = friends.people.filter((p) => p.relation === "friends");
  const sent = friends.people.filter((p) => p.relation === "sent");

  const section = (title, list) =>
    list.length > 0 && (
      <div style={{ marginTop: 18 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>
          {title} · {list.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {list.map((p) => (
            <PersonRow key={p.id} person={p} onOpen={onOpenProfile} onRelationChange={relationChanged} />
          ))}
        </div>
      </div>
    );

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
          maxWidth: 420,
          width: "100%",
          height: "min(620px, 85vh)",
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
              fontSize: 19,
              letterSpacing: 0.4,
            }}
          >
            Friends
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
            }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <Search size={16} color={MUTE} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search usernames…"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={16}
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
        </div>

        {results !== null ? (
          <div style={{ marginTop: 14 }}>
            {searching && results.length === 0 ? (
              <div style={{ color: MUTE, fontSize: 13 }}>Searching…</div>
            ) : results.length === 0 ? (
              <div style={{ color: MUTE, fontSize: 13 }}>No one by that name yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={{ ...p, relation: relationOf(p) }}
                    onOpen={onOpenProfile}
                    onRelationChange={relationChanged}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {section("Requests", incoming)}
            {section("Friends", accepted)}
            {section("Sent", sent)}
            {friends.people.length === 0 && (
              <div style={{ color: MUTE, fontSize: 13.5, lineHeight: 1.5, textAlign: "center", padding: "34px 10px" }}>
                No friends yet. Search for someone's username above to send a friend request. Friends can see each
                other's card, stats, and awards. Ratings always stay private.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
