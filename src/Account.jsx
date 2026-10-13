import React, { useState, useEffect } from "react";
import { User, ChevronDown } from "lucide-react";
import StreakBadge, { streakText } from "./StreakBadge.jsx";
import { streaks } from "./gameStats.js";
import { todayGameDateString } from "./dailyMovie.js";
import { supabase, googleAuthEnabled } from "./supabase.js";
import { COLORS, inputStyle, primaryBtn, secondaryBtn } from "./theme.js";

/* ---------------------------------------------------------
   Accounts. Signed in, lists and reviews are stored on the
   account (see cloudStore.js); signed out, they stay in this
   browser's localStorage.
--------------------------------------------------------- */

// session: undefined while loading, null when signed out.
// profile: null until loaded; profile.username is null until picked.
// streak: { current, best, activeToday } — consecutive days active on the
// site — for the button's streak badge; refreshStreak() re-reads it.
export function useAuth() {
  const [session, setSession] = useState(supabase ? undefined : null);
  const [profile, setProfile] = useState(null);
  const [streak, setStreak] = useState(null);
  const [streakVersion, setStreakVersion] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // don't await other supabase calls inside this callback — supabase-js holds
    // an auth lock while it runs, so they'd deadlock; the profile fetch below
    // runs from its own effect instead
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    setProfile(null);
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("username, display_name, member_number")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data ?? { username: null, display_name: null, member_number: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setStreak(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("activity_days")
      .select("day")
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setStreak(streaks(data.map((r) => r.day), todayGameDateString()));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, streakVersion]);

  return {
    enabled: Boolean(supabase),
    loading: session === undefined,
    session,
    user: session?.user ?? null,
    profile,
    setProfile,
    streak,
    setStreak,
    refreshStreak: () => setStreakVersion((n) => n + 1),
    signOut: () => supabase.auth.signOut(),
  };
}

// "#1", "#10,000" — the account's signup position, shown beside (never as
// part of) the username
export function memberNumberLabel(n) {
  return n ? `#${Number(n).toLocaleString("en-US")}` : "";
}

const pillStyle = {
  background: "#1E1E1E",
  color: "#E7E9EC",
  border: "1px solid rgba(231,233,236,0.14)",
  borderRadius: 999,
  fontFamily: "'Montserrat', sans-serif",
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  whiteSpace: "nowrap",
  // sized to its content and never squeezed — the homepage header moves it
  // onto its own line instead when it doesn't fit beside the logo
  flexShrink: 0,
  maxWidth: "100%",
  boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
};

export function AccountButton({ auth, onClick }) {
  if (!auth.enabled || auth.loading) return null;
  if (!auth.user) {
    return (
      <button
        onClick={onClick}
        style={{ ...pillStyle, gap: 8, padding: "5px 14px 5px 5px", fontSize: 13, fontWeight: 600 }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: `${COLORS.cobalt}2e`,
            color: COLORS.cobalt,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <User size={14} strokeWidth={2.4} />
        </span>
        Sign in
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      aria-label="Open your profile"
      style={{ ...pillStyle, gap: 8, padding: "4px 12px 4px 4px", fontSize: 13.5, fontWeight: 700 }}
    >
      <StreakBadge days={auth.streak?.current} size={32} />
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0, lineHeight: 1.15 }}>
        {/* name and member number share a line; only an extreme name (all
            wide letters at the 16-character cap) would wrap the number below */}
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 5, minWidth: 0 }}>
          {/* last resort on a very narrow phone: break the name onto a second
              line rather than run off-screen (real names never get here) */}
          <span style={{ whiteSpace: "normal", overflowWrap: "anywhere", minWidth: 0 }}>
            {auth.profile?.username || "Account"}
          </span>
          {auth.profile?.member_number && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8D96A3" }}>
              {memberNumberLabel(auth.profile.member_number)}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8D96A3", marginTop: 1 }}>
          {streakText(auth.streak?.current)}
        </span>
      </span>
      <ChevronDown size={14} color="#8D96A3" style={{ flexShrink: 0 }} />
    </button>
  );
}

function ModalShell({ onClose, title, children }) {
  return (
    <div
      onClick={onClose}
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
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

const hintStyle = { color: "#8D96A3", fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 };
const errorStyle = { color: COLORS.scarlet, fontSize: 13, marginTop: 10 };

// Email sign-in sends a magic link; the email can also carry a 6-digit code
// (if the Supabase email template includes {{ .Token }}), which matters on
// phones where the link opens in the mail app's own browser instead of the
// one the user started in.
export function SignInModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendEmail(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSentTo(trimmed);
  }

  async function verifyCode(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
    else onClose();
  }

  async function signInWithGoogle() {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  if (sentTo) {
    return (
      <ModalShell onClose={onClose} title="Check your email">
        <div style={hintStyle}>
          We sent a sign-in link to <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{sentTo}</span>. Open it on
          this device, or enter the code from the email.
        </div>
        <form onSubmit={verifyCode}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            style={inputStyle}
          />
          {error && <div style={errorStyle}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>
              Close
            </button>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              Verify
            </button>
          </div>
        </form>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="Sign in">
      <div style={hintStyle}>
        Sign in to save your lists and reviews to your account. No password needed. We'll email you a link.
      </div>
      <form onSubmit={sendEmail}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          style={inputStyle}
        />
        {error && <div style={errorStyle}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            Email me a link
          </button>
        </div>
      </form>
      {googleAuthEnabled && (
        <button onClick={signInWithGoogle} style={{ ...secondaryBtn, width: "100%", marginTop: 10 }}>
          Continue with Google
        </button>
      )}
    </ModalShell>
  );
}

// Shared by the first-time username prompt and "Change username" in the
// profile. Usernames keep their capitalization as typed; the database compares
// lower(username) for uniqueness (so "Allfather" also claims "allfather") and
// rejects blocked words (private.username_blocklist).
export const USERNAME_HINT = "3–16 characters: letters, numbers, or underscores.";

// Saves the username; resolves to an error message for the user, or null.
export async function saveUsername(userId, raw) {
  const value = raw.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(value)) return USERNAME_HINT;
  const { error } = await supabase.from("profiles").update({ username: value }).eq("id", userId);
  if (!error) return null;
  if (error.code === "23505") return "That username is taken.";
  if (error.message === "username_not_allowed") {
    return error.details === "reserved"
      ? "That username is reserved. Please choose another."
      : "That username isn't allowed. Please choose another.";
  }
  console.error(error);
  return "Couldn't save your username. Try again.";
}

// Shown once, right after first sign-in (the profile row exists from the
// signup trigger, but username starts out null).
export function UsernameModal({ auth }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const problem = await saveUsername(auth.user.id, username);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    auth.setProfile((p) => ({ ...p, username: username.trim() }));
  }

  return (
    <ModalShell onClose={() => {}} title="Pick a username">
      <div style={hintStyle}>This is how you'll show up on shared lists and reviews.</div>
      <form onSubmit={save}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          maxLength={16}
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
          style={inputStyle}
        />
        {error && <div style={errorStyle}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={auth.signOut} style={secondaryBtn}>
            Sign out
          </button>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            Save
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// Offered once per account per browser, after sign-in, when this browser has
// signed-out lists or ratings. Importing copies them; the local copies stay as
// they were (they're what you see when signed out).
export function ImportModal({ offer, onImport, onSkip }) {
  const { counts, busy, error } = offer;
  const parts = [];
  if (counts.lists) parts.push(`${counts.lists} list${counts.lists === 1 ? "" : "s"}`);
  if (counts.ratings) parts.push(`${counts.ratings} rating${counts.ratings === 1 ? "" : "s"}`);
  return (
    <ModalShell onClose={() => {}} title="Import from this browser?">
      <div style={hintStyle}>
        This browser has <span style={{ color: "#E7E9EC", fontWeight: 600 }}>{parts.join(" and ")}</span> saved from
        before you signed in. Add them to your account? Movies you've already rated on your account keep their
        account rating.
      </div>
      {error && <div style={{ ...errorStyle, marginTop: 0, marginBottom: 14 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onSkip} disabled={busy} style={secondaryBtn}>
          Don't import
        </button>
        <button onClick={onImport} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </ModalShell>
  );
}
