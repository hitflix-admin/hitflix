// "How the Hitflix Score works" popup, opened from the ⓘ next to the Hitflix
// score in the movie popup. Explains the idea behind the score (the craft vs.
// the reaction) without the formula. Sits above the movie popup (zIndex 60).

import { useEffect } from "react";
import { X, Clapperboard, Heart } from "lucide-react";
import { COLORS } from "./theme.js";
import { useScrollLock } from "./scrollLock.js";

const para = { margin: "0 0 12px", fontSize: 14, lineHeight: 1.55, color: "#C9CED6" };
const strong = { color: "#E7E9EC", fontWeight: 700 };

function Part({ Icon, title, detail, children }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        background: "#141414",
        borderRadius: 6,
        padding: "12px 12px",
        border: `1px solid ${COLORS.caramel}44`,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${COLORS.caramel}22`,
          color: COLORS.caramel,
        }}
      >
        <Icon size={17} strokeWidth={2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#E7E9EC", marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.caramel, marginBottom: 6 }}>{detail}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#C9CED6" }}>{children}</div>
      </div>
    </div>
  );
}

export default function HitflixScoreInfo({ onClose }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
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
        role="dialog"
        aria-modal="true"
        aria-label="How the Hitflix Score works"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#1E1E1E",
          borderRadius: 8,
          border: `1px solid ${COLORS.caramel}55`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          maxWidth: 420,
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
            color: COLORS.caramel,
            marginBottom: 14,
            paddingRight: 36,
          }}
        >
          How the Hitflix Score works
        </div>

        <p style={para}>
          <span style={strong}>We check the rating before we buy the ticket.</span> The problem is that most ratings
          capture the first reaction, and first reactions are loud.
        </p>
        <p style={para}>
          One person loves the story. Another can't get past a single plot point. Add all of that up and the result is
          movies that get called the greatest ever, and movies that get called unwatchable, when the truth is usually
          somewhere in between.
        </p>
        <p style={para}>
          You've probably felt this yourself. Everyone said a movie was terrible, you watched it anyway, and you
          thought, <em>"Honestly? That was good."</em>
        </p>

        <p style={{ ...para, ...strong, marginBottom: 10 }}>So we split the score in two.</p>

        <Part Icon={Clapperboard} title="The Craft" detail="Writing, Performances, Visuals and Sound">
          These are the parts of a movie that are hard to argue with. You can dislike a twist, but it's harder to deny
          that the cinematography was stunning or the score was great.
        </Part>
        <Part Icon={Heart} title="The Reaction" detail="How the movie made you feel overall">
          This part is personal. It's supposed to be, and it can vary a lot from one viewer to the next.
        </Part>

        <p style={{ ...para, marginTop: 12 }}>
          We weigh the two together, so one strong feeling can't sink a well-made movie or carry a weak one.
        </p>
        <p style={para}>
          <span style={strong}>The result is a score you can plan around.</span> Even if a movie splits audiences, you
          can still see that it has great performances and sharp writing, and decide for yourself.
        </p>
        <p style={{ ...para, marginBottom: 0 }}>
          <span style={strong}>Our goal is simple:</span> watch with the right expectations. No walking out feeling
          let down, and no realizing years later that you should have seen it sooner.
        </p>
      </div>
    </div>
  );
}
