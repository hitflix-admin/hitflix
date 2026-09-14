// Shared visual language across Hitflix pages (the ledger app and the daily game).
// Palette:   ink #141414 / surface #1E1E1E / paper #E7E9EC
//            blue #6C86AB / rose #B5544B / mute #8D96A3

export const COLORS = {
  ink: "#141414",
  surface: "#1E1E1E",
  paper: "#E7E9EC",
  blue: "#6C86AB",
  rose: "#B5544B",
  mute: "#8D96A3",
  green: "#4E8C5C",
  amber: "#C9A03D",
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
  background: "#6C86AB",
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
  background: "#B5544B",
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
  background: "#6C86AB",
  color: "#141414",
  border: "1px solid #6C86AB",
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
