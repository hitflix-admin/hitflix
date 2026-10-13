import React, { useState, useEffect } from "react";
import { User, ChevronDown } from "lucide-react";
import { supabase, googleAuthEnabled } from "./supabase.js";
import { COLORS, inputStyle, primaryBtn, secondaryBtn } from "./theme.js";

/* ---------------------------------------------------------
   Accounts. Signed in, lists and reviews are stored on the
   account (see cloudStore.js); signed out, they stay in this
   browser's localStorage.
--------------------------------------------------------- */

// session: undefined while loading, null when signed out.
// profile: null until loaded; profile.username is null until picked.
// card: { cardColor, poster } from the profile card, for the account button's
// avatar — null until loaded (or when the user hasn't made a card).
export function useAuth() {
  const [session, setSession] = useState(supabase ? undefined : null);
  const [profile, setProfile] = useState(null);
  const [card, setCard] = useState(null);

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
      .select("username, display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data ?? { username: null, display_name: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    setCard(null);
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("profile_cards")
      .select("card_color, movie:movies(poster_url)")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setCard({ cardColor: data.card_color, poster: data.movie?.poster_url || null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    enabled: Boolean(supabase),
    loading: session === undefined,
    session,
    user: session?.user ?? null,
    profile,
    setProfile,
    card,
    setCard,
    signOut: () => supabase.auth.signOut(),
  };
}

// Small round avatar: the profile card's favorite-movie poster, or the
// username's initial on the card color when there's no poster yet.
function Avatar({ auth, size = 30 }) {
  const [failed, setFailed] = useState(false);
  const accent = COLORS[auth.card?.cardColor] || COLORS.cobalt;
  const poster = auth.card?.poster;
  const base = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    boxSizing: "border-box",
    border: `2px solid ${accent}`,
  };
  if (poster && !failed) {
    return (
      <img
        src={poster}
        alt=""
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: "cover", objectPosition: "center 20%" }}
      />
    );
  }
  const initial = auth.profile?.username?.[0]?.toUpperCase();
  return (
    <span
      style={{
        ...base,
        background: `${accent}2e`,
        color: accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: size * 0.45,
      }}
    >
      {initial || <User size={size * 0.5} />}
    </span>
  );
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
  flexShrink: 0,
  maxWidth: "50%",
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
      style={{ ...pillStyle, gap: 8, padding: "4px 10px 4px 4px", fontSize: 13.5, fontWeight: 700 }}
    >
      <Avatar auth={auth} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
        {auth.profile?.username || "Account"}
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

// Shown once, right after first sign-in (the profile row exists from the
// signup trigger, but username starts out null).
export function UsernameModal({ auth }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    // saved with its capitalization as typed; the database compares
    // lower(username) for uniqueness, so "Allfather" also claims "allfather"
    const value = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(value)) {
      setError("3–20 characters: letters, numbers, or underscores.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.from("profiles").update({ username: value }).eq("id", auth.user.id);
    setBusy(false);
    if (error) {
      setError(error.code === "23505" ? "That username is taken." : error.message);
      return;
    }
    auth.setProfile((p) => ({ ...p, username: value }));
  }

  return (
    <ModalShell onClose={() => {}} title="Pick a username">
      <div style={hintStyle}>This is how you'll show up on shared lists and reviews.</div>
      <form onSubmit={save}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
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
