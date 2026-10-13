import { useEffect } from "react";

// Keeps the page behind a popup from scrolling while the popup is open — only
// the popup itself scrolls. `overflow: hidden` on <body> isn't enough on iOS
// Safari, so the body is pinned in place with position: fixed at its current
// scroll offset, and that offset is restored when the last popup closes.
// Counted, so stacked popups (e.g. a movie opened from search) only unlock
// once every one of them has closed.

let locks = 0;
let savedScrollY = 0;
let savedStyle = null;

function lock() {
  if (locks++ > 0) return;
  const body = document.body;
  savedScrollY = window.scrollY;
  savedStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  Object.assign(body.style, {
    position: "fixed",
    top: `-${savedScrollY}px`,
    left: "0",
    right: "0",
    width: "100%",
    overflow: "hidden",
  });
}

function unlock() {
  if (locks === 0 || --locks > 0) return;
  Object.assign(document.body.style, savedStyle);
  window.scrollTo(0, savedScrollY);
}

// Call at the top of any popup component: locks on mount, unlocks on unmount.
export function useScrollLock() {
  useEffect(() => {
    lock();
    return unlock;
  }, []);
}
