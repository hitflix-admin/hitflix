// Shared visual language across Hitflix pages (the ledger app and the daily game).
// Palette:   ink #141414 / surface #1E1E1E / paper #E7E9EC
//            blue #7B95BA / rose #B5544B / mute #8D96A3
//
// blue/rose/amber/green below are the original palette, kept (but no longer
// referenced anywhere) so any single color can be reverted by pointing a
// usage back at the old key instead of the 2026 refresh one.
// 2026 refresh: cobalt/orchid/caramel/fern/scarlet — see the palette
// mockup for how these were derived (same steel-blue hue as the original
// blue, just richer; the other three sharing one saturation/lightness family).
// scarlet is a new addition, not a rename of rose: rose was doing double
// duty as both the Faceoff game's brand accent (now orchid, decorative) and
// the site's error/wrong-answer/destructive-action color (semantic red,
// which orchid's magenta hue can't stand in for) — so that semantic role
// keeps its own red, just retuned to match the new palette's saturation
// and lightness instead of reusing the old muted brick-red verbatim.
export const COLORS = {
  ink: "#141414",
  surface: "#1E1E1E",
  paper: "#E7E9EC",
  mute: "#8D96A3",

  blue: "#7B95BA",
  rose: "#B5544B",
  green: "#4E8C5C",
  amber: "#C9A03D",

  cobalt: "#6E99D4",
  orchid: "#BF5CB8",
  caramel: "#BF945C",
  fern: "#5CBF63",
  scarlet: "#BF5A62",
};

export const inputStyle = {
  width: "100%",
  background: "#141414",
  border: "1px solid rgba(231,233,236,0.15)",
  borderRadius: 3,
  padding: "11px 12px",
  color: "#E7E9EC",
  // iOS Safari auto-zooms the page on focus for any text input whose font-size
  // is under 16px — keep this at (or above) 16 to avoid that.
  fontSize: 16,
  fontFamily: "'Montserrat', sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

export const primaryBtn = {
  flex: 1,
  background: COLORS.cobalt,
  color: "#141414",
  border: "none",
  borderRadius: 3,
  padding: "12px 14px",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
};

export const secondaryBtn = {
  flex: 1,
  background: "transparent",
  color: "#E7E9EC",
  border: "1px solid rgba(231,233,236,0.2)",
  borderRadius: 3,
  padding: "12px 14px",
  fontSize: 14.5,
  cursor: "pointer",
};

export const dangerBtn = {
  flex: 1,
  background: COLORS.scarlet,
  color: "#E7E9EC",
  border: "none",
  borderRadius: 3,
  padding: "12px 14px",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
};

export const segmentBtn = {
  flex: 1,
  background: "#141414",
  color: "#E7E9EC",
  border: "1px solid rgba(231,233,236,0.15)",
  borderRadius: 3,
  padding: "10px 14px",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Montserrat', sans-serif",
};

export const segmentBtnActive = {
  ...segmentBtn,
  background: COLORS.cobalt,
  color: "#141414",
  border: `1px solid ${COLORS.cobalt}`,
};

export const iconBtn = {
  background: "none",
  border: "none",
  color: "#E7E9EC",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  flexShrink: 0,
};
