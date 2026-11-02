// "What's new" announcements, oldest first. Each shows once (per account
// when signed in, per browser when signed out) to people who were already
// around when it was published; newcomers only see later ones.
//
// Adding one is a product decision: only add an entry the site owner has
// approved, wording included.
//
//   id           permanent, lowercase-dashes (it's what "seen" remembers)
//   publishedAt  ISO time it goes live; accounts/browsers newer than this
//                don't get it
//   title, body  headline and paragraphs
//   action       optional { label, href } button under the body; using it
//                counts as closing the popup

export const UPDATES = [
  {
    id: "2026-10-hitflix-score",
    publishedAt: "2026-10-25T00:00:00Z",
    title: "New to Hitflix: aggregate movie reviews!",
    body: [
      "Every movie now has an official Hitflix score: the average of everyone's ratings. A score shows up once enough people have rated a movie, so every rating helps.",
      'Sign in, rate the movies you\'ve seen, and look for "Contribute to the official Hitflix score" on the home page.',
    ],
  },
  {
    id: "2026-11-who-am-i",
    publishedAt: "2026-11-01T00:00:00Z",
    title: "“You're tearing me apart, Lisa!”",
    body: [
      "If you know where that's from, you're ready for Who am I?, the new daily game. Name the movie from one line of dialogue in 5 tries. Every miss brings an easier line, ending on the movie's most famous quote.",
      "Find it under Games on the home page.",
    ],
    action: { label: "Play Who am I?", href: "/games/who-am-i" },
  },
];
