// Home screen tagline: a movie-flavored line that changes once a day, the same
// for every visitor. Mix of real quotes, movie-quote puns reworked around
// Hitflix (lists, watching, ratings), and Rocky-voiced (Project Hail Mary)
// bits ribbing movie critics. Reuses dailyMovie.js's shared "what day is it
// for everyone" logic (midnight US Eastern) so this rolls over in lockstep
// with the daily puzzles without its own server round-trip.

import { daysSinceEpoch, todayGameDateString } from "./dailyMovie.js";

// Ordering here fixes which line lands on which calendar day (index N shows
// up daysSinceEpoch(today) % length days from the launch epoch) — reorder
// deliberately, not just to add/remove lines.
export const DAILY_QUOTES = [
  "You had me at 'Add to List.'",
  "Shall we play a game?",
  "Did we just become best friends?",
  "I had strings, but now I'm free.",
  "Amaze amaze amaze!",
  "Why bad review longer than good review, question.",
  "Why one star mean bad, star is good thing, question.",
  "Why critic say overrated. Rated by who, question.",
  "Why human need stranger opinion before watching, question.",
  "Why critic watch movie once, then know everything, question.",
  "We're gonna need a longer list.",
];

// Cycles through the pool in order, one per calendar day, wrapping back to
// the start once every line's had its turn.
export function getDailyQuote(dateString = todayGameDateString()) {
  const n = DAILY_QUOTES.length;
  const index = ((daysSinceEpoch(dateString) % n) + n) % n;
  return DAILY_QUOTES[index];
}
