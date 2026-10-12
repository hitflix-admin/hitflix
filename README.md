# Hitflix

A personal film ledger — build named movie lists, search titles via Wikipedia, and reorder them by drag.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Deploys automatically to GitHub Pages on every push to `main` via [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Accounts (Supabase)

Accounts run on [Supabase](https://supabase.com). Without keys the site still works fully signed-out on `localStorage`.

1. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
2. Run the SQL in `supabase/migrations/` (in order) in the Supabase SQL Editor.
3. For production builds, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as GitHub Actions secrets.
